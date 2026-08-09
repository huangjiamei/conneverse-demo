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
import { searchVisibilityWhere } from "@/lib/searchScope";

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
  // 可见范围内才给 —— 否则员工换个 id 就能读到别人/别店的结果
  const payload = await loadUserResults(id, searchVisibilityWhere(session));
  if (!payload) {
    return NextResponse.json({ error: "Search not found." }, { status: 404 });
  }
  return NextResponse.json(payload);
}
