/**
 * POST /api/auth/reset-password —— body: { token, password }
 *
 * 服务端重验令牌 —— 页面那次只读校验只是为了决定要不要显示表单,不能当授权。
 * 校验、改密码、作废令牌三件事在 consumePasswordResetToken 的同一个事务里完成,
 * 并用 CAS 保证同一个链接只被消费一次。
 *
 * 密码强度走 validatePassword,和注册是同一条规则 —— 不允许两边走偏。
 *
 * 这里不发会话:改完密码让用户回登录页正常登录,这样 emailVerified / status
 * 两道守卫都还会照常生效,重置不构成绕过。
 */

import { NextResponse } from "next/server";
import { validatePassword } from "@/lib/auth/password";
import { consumePasswordResetToken } from "@/lib/auth/passwordReset";
import { clientIp, rateLimit } from "@/lib/auth/rateLimit";

export const dynamic = "force-dynamic";

/** 令牌失效时的统一文案 —— 三种原因分开讲,用户才知道下一步该干嘛 */
const FAILURE_COPY = {
  EXPIRED:
    "That reset link has expired — they're only good for an hour. Request a new one.",
  USED: "That reset link has already been used. Request a new one.",
  INVALID:
    "We couldn't match that reset link. It may have been cut off in your email client — request a new one.",
} as const;

export async function POST(req: Request) {
  // 拿着一堆猜的 token 硬撞也算暴力破解,一并限流
  const limit = rateLimit(`reset-pw:${clientIp(req)}`, 10, 15 * 60 * 1000);
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
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { token, password } = (body ?? {}) as Record<string, unknown>;

  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json(
      { error: FAILURE_COPY.INVALID, code: "INVALID" },
      { status: 400 }
    );
  }

  // 先判强度再动令牌: 密码不合格就退回去重填,别把这条链接白白烧掉
  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json(
      { error: passwordError, fieldErrors: { password: passwordError } },
      { status: 400 }
    );
  }

  const result = await consumePasswordResetToken(token, password as string);
  if (result.outcome !== "RESET") {
    return NextResponse.json(
      { error: FAILURE_COPY[result.outcome], code: result.outcome },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Your password has been reset. Sign in with your new password.",
  });
}
