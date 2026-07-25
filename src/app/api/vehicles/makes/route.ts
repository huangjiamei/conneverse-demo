/**
 * GET /api/vehicles/makes?year=2019
 *
 * 返回该年份下有车的品牌, 按名称排序。
 * 走 VcdbBaseVehicle 的 @@index([yearId, makeId, modelId])。
 * 返回: [{ id, name }]
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const year = Number(new URL(req.url).searchParams.get("year"));
  // 注意: 缺省参数时 get() 返回 null, Number(null)===0 且 isInteger(0)===true,
  // 所以必须额外要求 > 0 才能真正拦住缺参。VCdb 的 id/年份都是正整数。
  if (!Number.isInteger(year) || year <= 0) {
    return NextResponse.json(
      { error: "Query must include a valid ?year=<int>" },
      { status: 400 }
    );
  }

  const makes = await prisma.vcdbMake.findMany({
    where: { baseVehicles: { some: { yearId: year } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json(makes);
}
