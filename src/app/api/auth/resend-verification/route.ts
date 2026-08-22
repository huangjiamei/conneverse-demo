/**
 * POST /api/auth/resend-verification —— body: { email }
 *
 * 作废旧令牌、发一封新的验证邮件。
 *
 * 反枚举 (§D):无论这个邮箱是否注册过、是否已验证,响应体和状态码都一模一样。
 * 唯一会变的是 429 —— 那是调用方自己刚刚请求过,不泄露任何账号信息。
 *
 * 两层限流:每邮箱 60s 冷却 (§C3),另外每 IP 每 10 分钟 5 次,挡住拿这个
 * 接口当群发工具用。冷却先判、再查库,免得 429/200 的差异反过来变成探测手段。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/auth/rateLimit";
import { sendVerificationEmail } from "@/lib/email/notify";

export const dynamic = "force-dynamic";

/** 60s 冷却 —— 同一个邮箱在这之内只发一封 */
export const RESEND_COOLDOWN_SEC = 60;

// 邮箱是否存在一律不说,这句话对谁都成立
const NEUTRAL =
  "If that address needs verifying, we've sent a new link. Check your inbox.";

export async function POST(req: Request) {
  const byIp = rateLimit(`resend-verify-ip:${clientIp(req)}`, 5, 10 * 60 * 1000);
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
      { error: "Enter the email address you registered with." },
      { status: 400 }
    );
  }

  // 冷却按邮箱算,且在查库之前 —— 存在与不存在的邮箱走完全相同的路径
  const byEmail = rateLimit(
    `resend-verify-email:${email}`,
    1,
    RESEND_COOLDOWN_SEC * 1000
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
      select: { id: true, emailVerified: true },
    });
    // 不存在 / 已验证 → 什么都不做,但回同一句话
    if (user && !user.emailVerified) {
      await sendVerificationEmail(user.id);
    }
  } catch (err) {
    // 查库/发信出问题也不改变对外说法,只留日志
    console.error("[resend-verification] failed", err);
  }

  return NextResponse.json({ ok: true, message: NEUTRAL });
}
