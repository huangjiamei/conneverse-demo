/**
 * 服务端读写 session cookie。
 *
 * 用了 next/headers,所以只能在 server component / route handler 里 import
 * (proxy.ts 请用 jwt.ts 的 verifySessionToken 直接读 request cookie)。
 */

import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySessionToken,
} from "./jwt";
import type { Session } from "./types";

/**
 * cookie 里「声称」的会话 —— 只验签名,不查库,所以 role/status 可能已经过期。
 *
 * 授权判断请用 liveSession.ts 里的 getLiveSession()/requireLive*(),
 * 那边会拿 Shop.adminUserId 和 User.status 复核。这里只适合登录本身和
 * 不敏感的读取。
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(session: Session): Promise<void> {
  const token = await signSession(session);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax", // 自建 cookie,靠 SameSite 挡 CSRF
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
