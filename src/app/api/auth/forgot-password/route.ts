/**
 * POST /api/auth/forgot-password —— body: { email }
 *
 * 发一封重置密码邮件。只认 User;平台 Admin 不走这条路 (他的密码走 DB / Profile)。
 *
 * 反枚举:无论这个邮箱是否注册过、是不是平台管理员、账号什么状态,响应体和状态码
 * 都一模一样。唯一会变的是 429 —— 那是调用方自己刚请求过,不泄露任何账号信息。
 *
 * 两层限流:每邮箱 60s 冷却,另外每 IP 每 15 分钟 5 次,挡住拿这个接口当轰炸机用。
 * 冷却先判、再查库,免得 429/200 的差异反过来变成探测手段。
 *
 * 刻意不校验账号状态:未验证 / PENDING / REJECTED 的人照样能改密码 —— 改完能不能
 * 登录,由登录守卫自己判。在这里按状态分流,等于把账号状态泄露给了任何人。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/auth/rateLimit";
import { sendPasswordResetEmail } from "@/lib/email/notify";

export const dynamic = "force-dynamic";

/** 同一个邮箱两封重置信之间的最小间隔 */
export const FORGOT_COOLDOWN_SEC = 60;

// 这句话对"注册过"和"没注册过"同样成立
const NEUTRAL =
  "If an account exists for that email, we've sent a reset link.";

export async function POST(req: Request) {
  const byIp = rateLimit(`forgot-pw-ip:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!byIp.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(byIp.retryAfterSec) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  const email =
    typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json(
      { error: "Enter the email address for your account." },
      { status: 400 }
    );
  }

  // 冷却按邮箱算,且在查库之前 —— 存在与不存在的邮箱走完全相同的路径
  const byEmail = rateLimit(
    `forgot-pw-email:${email}`,
    1,
    FORGOT_COOLDOWN_SEC * 1000
  );
  if (!byEmail.allowed) {
    return NextResponse.json(
      {
        error: `Please wait ${byEmail.retryAfterSec}s before requesting another link.`,
        retryAfterSec: byEmail.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(byEmail.retryAfterSec) } }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (user) await sendPasswordResetEmail(user.id);
  } catch (err) {
    // 查库/发信出问题也不改变对外说法,只留日志
    console.error("[forgot-password] failed", err);
  }

  return NextResponse.json({ ok: true, message: NEUTRAL });
}
