/**
 * `withApi` — the wrapper every /api route handler is composed with.
 * Enforces the session-token gate and per-session rate limit, then runs
 * the handler with JSON error handling.
 *
 * This is the enforcement point that makes search results non-scrapeable:
 * a request without a session token (cookie or Bearer) is rejected 401.
 * Browser clients always carry the cookie the proxy issued on page load;
 * a raw scraper does not.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSessionToken } from "./session";
import { checkRateLimit } from "./rate-limit";

type Handler = (
  req: NextRequest,
  ctx: { session: string },
) => Promise<NextResponse> | NextResponse;

export function withApi(handler: Handler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const session = getSessionToken(req);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized. A session is required." },
        { status: 401 },
      );
    }

    const now = Date.now();
    const rl = checkRateLimit(session, now);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Slow down." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    try {
      const res = await handler(req, { session });
      res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[api] ${req.nextUrl.pathname} failed:`, message);
      const isUpstream = message.startsWith("eBay ");
      return NextResponse.json(
        {
          error: isUpstream
            ? "Upstream request failed"
            : "Internal server error",
          detail: message,
        },
        { status: isUpstream ? 502 : 500 },
      );
    }
  };
}

/** Parse a JSON body, throwing a tagged error the wrapper turns into a
 * clean 500 (or callers can catch for a 400). */
export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}
