/**
 * DELETE /api/search/history
 *
 * Body: { ids: string[] }  (matchSearchId 数组)
 *
 * 单条删 = ids 长度 1, 批量删 = 多个 id, 复用同一接口。
 *
 * 越权防护靠「带 scope 的 deleteMany」——把可见范围直接并进 where, 不在范围内的
 * id 根本匹配不到, 天然删不掉, 不需要先读再判 (也就没有 TOCTOU 的缝)。
 * 批量里混了越权 id 时只删掉范围内的那些, 返回真实删除数。
 *
 * Candidate / OptimizerResult 的 matchSearchId 外键都是 ON DELETE CASCADE,
 * 所以删 MatchSearch 会连带清干净, 不用手工按序删三张表。
 * (PurchaseOrder.candidateId 是 RESTRICT —— 已下单的候选会挡住删除, 这是既有行为。)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/auth/liveSession";
import { searchVisibilityWhere } from "@/lib/searchScope";

export async function DELETE(req: Request) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty string[]" },
      { status: 400 }
    );
  }

  const { count } = await prisma.matchSearch.deleteMany({
    where: { id: { in: ids }, ...searchVisibilityWhere(session) },
  });

  // 一个都没删掉 = 这些 id 要么不存在, 要么不归你。两种情况给同一个回复,
  // 免得靠状态码探测别人的搜索是否存在。
  if (count === 0) {
    return NextResponse.json(
      { error: "No matching searches you can delete." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    deleted: { matchSearch: count },
    requested: ids.length,
    // 批量里有越权/不存在的 id 时, 让客户端知道没全删
    skipped: ids.length - count,
  });
}
