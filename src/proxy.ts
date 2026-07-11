/**
 * Proxy (formerly "middleware" — renamed in Next.js 16).
 *
 * Auth stub: ensures every visitor carries a `cv_session` cookie. It's
 * issued on the first page/app response, so by the time client code
 * fetches /api/*, the cookie is present and same-origin requests send
 * it automatically. Raw scrapers that never load the app — and so never
 * receive the cookie — are rejected by `withApi` on the API routes.
 *
 * State-free by design (proxy may run at the edge): it only sets a
 * cookie. The actual gate + rate limit live in `withApi`, called from
 * each route handler.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, issueSessionToken } from "@/lib/api/session";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)) {
    // Seed a session. Demo-grade entropy — a signed session would go
    // here in production.
    const seed = `${request.headers.get("user-agent") ?? "ua"}:${request.nextUrl.pathname}:${Date.now()}`;
    response.cookies.set(SESSION_COOKIE, issueSessionToken(seed), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image optimization, so
  // the session cookie is set on the very first document load.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
