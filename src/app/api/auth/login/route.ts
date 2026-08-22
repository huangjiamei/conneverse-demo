/**
 * POST /api/auth/login —— body: { email, password }
 *
 * 顺序: 先查 Admin (平台管理员),再查 User。
 * 角色在这里算定并写进 JWT: Admin 命中 → PLATFORM_ADMIN;
 * 否则看 User.adminOf (即 Shop.adminUserId 反向关系) → SHOP_ADMIN / EMPLOYEE。
 *
 * 错误信息一律 "Invalid email or password",不透露邮箱是否注册过。
 * 唯一例外是密码正确但账号还进不来 (邮箱未验证 / status !== APPROVED) ——
 * 此时对方已证明自己是账号本人,回一个可判断的原因让客户端提示或跳转。
 * 这两种用户都拿不到会话 (§5 方案 A)。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { landingPath } from "@/lib/auth/routes";
import { clientIp, rateLimit } from "@/lib/auth/rateLimit";
import type { Session } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

const GENERIC = "Invalid email or password";

function reject() {
  return NextResponse.json({ error: GENERIC }, { status: 401 });
}

export async function POST(req: Request) {
  const limit = rateLimit(`login:${clientIp(req)}`, 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reject();
  }
  const { email: rawEmail, password } = (body ?? {}) as Record<string, unknown>;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email || typeof password !== "string" || !password) return reject();

  // ---- 1. 平台管理员 ----
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (admin) {
    if (!(await verifyPassword(password, admin.passwordHash))) return reject();
    const session: Session = {
      id: admin.id,
      kind: "admin",
      role: "PLATFORM_ADMIN",
      shopId: null,
      status: "APPROVED",
      name: admin.name,
      email: admin.email,
    };
    await setSessionCookie(session);
    return NextResponse.json({ ok: true, redirect: landingPath(session) });
  }

  // ---- 2. 员工 / 店铺管理员 ----
  const user = await prisma.user.findUnique({
    where: { email },
    include: { adminOf: { select: { id: true } } },
  });
  if (!user) return reject();
  if (!(await verifyPassword(password, user.passwordHash))) return reject();

  // ---- 邮箱验证守卫 (§C4) ----
  // 和 status 是两道独立的闸,两个都过才放行。这一道在前,不分 status:
  // 没验证过的邮箱就是没证明可达,APPROVED 也不例外 (老账号已由 Vera 回填成
  // 已验证,不会被锁死)。现有 status 逻辑一个字没动,只是并了上去。
  if (!user.emailVerified) {
    return NextResponse.json(
      {
        error: "Please verify your email first",
        needsEmailVerification: true,
        redirect: `/verify-email?email=${encodeURIComponent(user.email)}`,
      },
      { status: 403 }
    );
  }

  if (user.status !== "APPROVED") {
    // 密码已对上 → 可以安全地告诉本人账号状态
    const claimPending =
      user.status === "PENDING" &&
      (await prisma.shopAdminRequest.count({
        where: { userId: user.id, kind: "CLAIM", status: "PENDING" },
      })) > 0;

    return NextResponse.json(
      {
        error: "Your account is not active yet.",
        status: user.status,
        claimPending,
        redirect: `/pending?status=${user.status}${claimPending ? "&claim=1" : ""}`,
      },
      { status: 403 }
    );
  }

  const session: Session = {
    id: user.id,
    kind: "user",
    // Shop.adminUserId == user.id 才是店铺管理员
    role: user.adminOf ? "SHOP_ADMIN" : "EMPLOYEE",
    shopId: user.shopId,
    status: "APPROVED",
    name: user.name,
    email: user.email,
  };
  await setSessionCookie(session);
  return NextResponse.json({ ok: true, redirect: landingPath(session) });
}
