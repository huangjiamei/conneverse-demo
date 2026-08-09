/**
 * 路由守卫。
 *
 * Next 16 起 middleware 改名为 Proxy (文件必须叫 proxy.ts,和 app/ 同级),
 * 默认跑 Node.js runtime —— 但这里仍然只验 JWT 签名、不查库:
 * 官方明确说 Proxy 不该承担完整鉴权,页面/API 里还有第二道 requireLiveSession()。
 *
 * 规则 (采用 §5 方案 A: 未批准的用户根本拿不到会话):
 *   无会话 + 公开路径      → 放行
 *   无会话 + 其它          → 跳 / (登录)
 *   有会话 + / 或 /register → 跳各自 landing
 *   有会话 + 越权          → 跳各自 landing
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";
import {
  canAccess,
  isPublicPath,
  landingPath,
  shouldRedirectAwayFrom,
} from "@/lib/auth/routes";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySessionToken(
    req.cookies.get(SESSION_COOKIE)?.value
  );

  // API 不该被 302 到 HTML 登录页 —— 给调用方一个能判断的 401/403
  const isApi = pathname.startsWith("/api/");

  if (!session) {
    if (isPublicPath(pathname)) return NextResponse.next();
    if (isApi) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  const landing = landingPath(session);

  if (shouldRedirectAwayFrom(pathname)) {
    return NextResponse.redirect(new URL(landing, req.url));
  }
  if (!canAccess(session, pathname)) {
    if (isApi) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(landing, req.url));
  }
  return NextResponse.next();
}

export const config = {
  // 跳过静态资源和 Next 内部路径,其余全过守卫
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)"],
};
