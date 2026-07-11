/**
 * Session-token stub. A real implementation would verify a signed
 * session (JWT / DB-backed). Here a session is any opaque token
 * presented as the `cv_session` cookie or a Bearer Authorization
 * header. The proxy (src/proxy.ts) issues the cookie on page loads so
 * browser clients always carry one; raw scrapers without it are
 * rejected by `withApi`.
 */

import { createHash } from "crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "cv_session";

/** Read the session token from cookie or Authorization header. */
export function getSessionToken(req: NextRequest): string | null {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) return cookie;

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return null;
}

/** Mint a fresh opaque session token. Demo-grade: derived from a
 * high-entropy seed. Production would sign this. */
export function issueSessionToken(seed: string): string {
  return createHash("sha256")
    .update(seed)
    .digest("base64url")
    .slice(0, 24);
}
