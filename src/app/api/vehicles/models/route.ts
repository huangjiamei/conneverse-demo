/**
 * GET /api/vehicles/models?year=2019&makeId=59
 *
 * 返回该 year+make 下的车型, 按名称排序。
 * 返回: [{ id, name }]
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const year = Number(sp.get("year"));
  const makeId = Number(sp.get("makeId"));
  // > 0: 缺参时 get() 返回 null → Number(null)===0 会绕过 isInteger 检查
  if (!Number.isInteger(year) || year <= 0 || !Number.isInteger(makeId) || makeId <= 0) {
    return NextResponse.json(
      { error: "Query must include valid ?year=<int>&makeId=<int>" },
      { status: 400 }
    );
  }

  const models = await prisma.vcdbModel.findMany({
    where: { baseVehicles: { some: { yearId: year, makeId } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json(models);
}
