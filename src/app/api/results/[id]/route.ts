/**
 * GET /api/results/[id] —— customer-facing result set for one MatchSearch.
 *
 * Lets the search page render results inline (same page, below the search bar)
 * instead of navigating to /results/[id]. Same data, same selection logic —
 * see lib/userResultsData.ts.
 */

import { NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/liveSession";
import { loadUserResults } from "@/lib/userResultsData";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  // session 同时决定可见范围和字段裁剪 —— 员工换个 id 读不到别人的结果,
  // 店铺角色也拿不到 eBay 链接/卖家字段 (见 lib/userResultsData)
  const payload = await loadUserResults(id, session);
  if (!payload) {
    return NextResponse.json({ error: "Search not found." }, { status: 404 });
  }
  return NextResponse.json(payload);
}
