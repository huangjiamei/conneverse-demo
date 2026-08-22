/**
 * POST /api/auth/register
 *
 * body: { name, email, password, shopId, applyAsAdmin? }
 *
 * 落库后不发会话 (§5 方案 A): 新用户是 PENDING + emailVerified=false,客户端
 * 自己跳 /pending;同时发一封验证邮件,邮箱验证通过后才算正式进入待审核。
 * applyAsAdmin 只有在店铺确实无管理员、且没有同店在审 CLAIM 时才建
 * ShopAdminRequest;条件不满足就静默降级成普通员工注册,不让整单失败。
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/auth/rateLimit";
import { sendVerificationEmail } from "@/lib/email/notify";

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
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          shopId: shop.id,
          status: "PENDING",
          // 邮箱还没验证 —— 验证通过前这条注册不算正式进入待审核
          emailVerified: false,
        },
        select: { id: true },
      });

      if (applyAsAdmin !== true) return { userId: user.id, claimFiled: false };

      // 事务内复查,挡住"两人同时认领同一家店"和重复提交
      const fresh = await tx.shop.findUnique({
        where: { id: shop.id },
        select: { adminUserId: true },
      });
      // 期间已有管理员 → 静默降级
      if (fresh?.adminUserId) return { userId: user.id, claimFiled: false };

      const pendingClaim = await tx.shopAdminRequest.findFirst({
        where: { shopId: shop.id, kind: "CLAIM", status: "PENDING" },
        select: { id: true },
      });
      // 已有人在审 → 静默降级
      if (pendingClaim) return { userId: user.id, claimFiled: false };

      await tx.shopAdminRequest.create({
        data: {
          shopId: shop.id,
          userId: user.id,
          kind: "CLAIM",
          status: "PENDING",
        },
      });
      return { userId: user.id, claimFiled: true };
    });

    // 先落库、后发信 (§D): 发不出去也不回滚,用户可以在验证页重发。
    // 如实回报有没有发出去 —— 前端据此决定要不要直接把重发入口顶到前面。
    const emailVerificationSent = await sendVerificationEmail(created.userId);

    return NextResponse.json(
      { ok: true, claimFiled: created.claimFiled, emailVerificationSent },
      { status: 201 }
    );
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
