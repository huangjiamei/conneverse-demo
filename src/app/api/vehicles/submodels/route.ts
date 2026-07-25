/**
 * GET /api/vehicles/submodels?year=2019&makeId=59&modelId=751
 *
 * 返回该 year+make+model 下的所有 sub-model。选中一个 sub-model 就等于
 * 选定了一辆具体的 VcdbVehicle, 所以直接把 vehicleId 一起返回, 前端提交
 * 搜索时不用再查一次。
 *
 * 返回: [{ id: subModelId, name, baseVehicleId, vehicleId }]
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const year = Number(sp.get("year"));
  const makeId = Number(sp.get("makeId"));
  const modelId = Number(sp.get("modelId"));
  // > 0: 缺参时 get() 返回 null → Number(null)===0 会绕过 isInteger 检查
  if (
    !Number.isInteger(year) || year <= 0 ||
    !Number.isInteger(makeId) || makeId <= 0 ||
    !Number.isInteger(modelId) || modelId <= 0
  ) {
    return NextResponse.json(
      { error: "Query must include valid ?year=<int>&makeId=<int>&modelId=<int>" },
      { status: 400 }
    );
  }

  // 直接从 VcdbVehicle 走关联过滤 (year+make+model 通常唯一对应一个
  // baseVehicle, 但用关联查询能顺带兼容极少数一对多的情况)。
  const vehicles = await prisma.vcdbVehicle.findMany({
    where: { baseVehicle: { yearId: year, makeId, modelId } },
    select: {
      id: true,
      baseVehicleId: true,
      subModel: { select: { id: true, name: true } },
    },
    orderBy: { subModel: { name: "asc" } },
  });

  // 按 subModelId 去重 (防御性: 若同一 submodel 出现在多个 baseVehicle)
  const seen = new Set<number>();
  const submodels = [];
  for (const v of vehicles) {
    if (seen.has(v.subModel.id)) continue;
    seen.add(v.subModel.id);
    submodels.push({
      id: v.subModel.id,
      name: v.subModel.name,
      baseVehicleId: v.baseVehicleId,
      vehicleId: v.id,
    });
  }

  return NextResponse.json(submodels);
}
