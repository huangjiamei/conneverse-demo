/**
 * POST /api/auth/register
 *
 * body: { name, email, password, shopId, applyAsAdmin? }
 *
 * 落库后不发会话 (§5 方案 A): 新用户是 PENDING,客户端自己跳 /pending。
 * applyAsAdmin 只有在店铺确实无管理员、且没有同店在审 CLAIM 时才建
 * ShopAdminRequest;条件不满足就静默降级成普通员工注册,不让整单失败。
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/auth/rateLimit";

export const dynamic = "force-dynamic";

// 够用的宽松校验: 真正的正确性由发信验证保证,这里只挡明显的垃圾输入
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = Partial<
  Record<"name" | "email" | "password" | "shopId", string>
>;

function invalid(fieldErrors: FieldErrors, message = "Please fix the errors below.") {
  return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
}

export async function POST(req: Request) {
  const limit = rateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    name: rawName,
    email: rawEmail,
    password,
    shopId,
    applyAsAdmin,
  } = (body ?? {}) as Record<string, unknown>;

  // ---- 校验 (服务端从不信客户端) ----
  const fieldErrors: FieldErrors = {};

  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) fieldErrors.name = "Name is required.";

  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email) fieldErrors.email = "Email is required.";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (typeof shopId !== "string" || !shopId) {
    fieldErrors.shopId = "Select your shop.";
  }

  if (Object.keys(fieldErrors).length > 0) return invalid(fieldErrors);

  const shop = await prisma.shop.findUnique({
    where: { id: shopId as string },
    select: { id: true, adminUserId: true },
  });
  if (!shop) return invalid({ shopId: "That shop no longer exists." });

  // ---- 邮箱跨 Admin + User 两张表唯一 (DB 只有各自的 unique) ----
  const [existingUser, existingAdmin] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.admin.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (existingUser || existingAdmin) {
    return invalid({ email: "An account with this email already exists." });
  }

  const passwordHash = await hashPassword(password as string);

  try {
    const claimFiled = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash, shopId: shop.id, status: "PENDING" },
        select: { id: true },
      });

      if (applyAsAdmin !== true) return false;

      // 事务内复查,挡住"两人同时认领同一家店"和重复提交
      const fresh = await tx.shop.findUnique({
        where: { id: shop.id },
        select: { adminUserId: true },
      });
      if (fresh?.adminUserId) return false; // 期间已有管理员 → 静默降级

      const pendingClaim = await tx.shopAdminRequest.findFirst({
        where: { shopId: shop.id, kind: "CLAIM", status: "PENDING" },
        select: { id: true },
      });
      if (pendingClaim) return false; // 已有人在审 → 静默降级

      await tx.shopAdminRequest.create({
        data: {
          shopId: shop.id,
          userId: user.id,
          kind: "CLAIM",
          status: "PENDING",
        },
      });
      return true;
    });

    return NextResponse.json({ ok: true, claimFiled }, { status: 201 });
  } catch (err) {
    // 并发注册同一邮箱时 User.email 的 unique 兜底
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return invalid({ email: "An account with this email already exists." });
    }
    console.error("[register] failed", err);
    return NextResponse.json(
      { error: "Could not complete registration. Please try again." },
      { status: 500 }
    );
  }
}
