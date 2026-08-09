/**
 * POST /api/shops/[id]/admin —— body: { userId }
 *
 * Platform-admin convenience from §3b: pick an approved member and make them
 * the shop admin directly. It is a REPLACE that skips the request step, so it
 * runs through the same transaction (assignShopAdmin) — same CAS on
 * adminUserId, same automatic demotion of the previous admin, same superseding
 * of any pending requests.
 */

import { NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/liveSession";
import { assignShopAdmin, statusForFailure } from "@/lib/auth/review";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { userId?: unknown };
  if (typeof body.userId !== "string" || !body.userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const result = await assignShopAdmin(id, body.userId, session.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: statusForFailure(result.code) }
    );
  }
  return NextResponse.json(result);
}
