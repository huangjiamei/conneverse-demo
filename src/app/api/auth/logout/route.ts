/**
 * POST /api/auth/logout —— 清 session cookie。
 *
 * 只收 POST: GET 退出会被第三方页面用 <img src> 之类的方式触发。
 * cookie 是 SameSite=Lax,跨站 POST 带不上,等于自带 CSRF 防护。
 */

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
