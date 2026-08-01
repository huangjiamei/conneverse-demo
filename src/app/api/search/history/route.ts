/**
 * DELETE /api/search/history
 *
 * Body: { ids: string[] }  (matchSearchId 数组)
 *
 * 单条删 = ids 长度 1, 批量删 = 多个 id, 复用同一接口。
 * 事务里按外键顺序删 (OptimizerResult → Candidate → MatchSearch),
 * 只碰这三张表, PartLine 不动。返回各表删除数量。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: Request) {
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

  const [opt, cand, ms] = await prisma.$transaction([
    prisma.optimizerResult.deleteMany({ where: { matchSearchId: { in: ids } } }),
    prisma.candidate.deleteMany({ where: { matchSearchId: { in: ids } } }),
    prisma.matchSearch.deleteMany({ where: { id: { in: ids } } }),
  ]);

  return NextResponse.json({
    deleted: {
      optimizerResult: opt.count,
      candidate: cand.count,
      matchSearch: ms.count,
    },
  });
}
