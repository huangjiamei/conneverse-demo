/**
 * POST /api/profile/password —— body: { currentPassword, newPassword }
 *
 * Verifies the current password with bcrypt against whichever table owns the
 * session (Admin or User), then rehashes at the same cost. A wrong current
 * password is a flat 400 on that field and nothing else — no hint about the
 * account, and no distinction between "wrong password" and "account missing".
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/auth/liveSession";
import {
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/auth/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 改密接口也是猜旧密码的入口,限一下
  const limit = rateLimit(`password:${session.id}:${clientIp(req)}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) {
    return NextResponse.json(
      {
        error: "Please fix the errors below.",
        fieldErrors: { currentPassword: "Enter your current password." },
      },
      { status: 400 }
    );
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        error: "Please fix the errors below.",
        fieldErrors: {
          newPassword: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        },
      },
      { status: 400 }
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      {
        error: "Please fix the errors below.",
        fieldErrors: { newPassword: "Choose a password you haven't used here." },
      },
      { status: 400 }
    );
  }

  const wrongCurrent = NextResponse.json(
    {
      error: "Please fix the errors below.",
      fieldErrors: { currentPassword: "That's not your current password." },
    },
    { status: 400 }
  );

  const hash = await hashPassword(newPassword);

  if (session.kind === "admin") {
    const admin = await prisma.admin.findUnique({
      where: { id: session.id },
      select: { passwordHash: true },
    });
    if (!admin) return wrongCurrent;
    if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
      return wrongCurrent;
    }
    await prisma.admin.update({
      where: { id: session.id },
      data: { passwordHash: hash },
    });
  } else {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { passwordHash: true },
    });
    if (!user) return wrongCurrent;
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return wrongCurrent;
    }
    await prisma.user.update({
      where: { id: session.id },
      data: { passwordHash: hash },
    });
  }

  // 现有会话保持有效 —— JWT 不含口令,改密不影响本次登录。
  return NextResponse.json({ ok: true });
}
