/**
 * GET /api/vehicles/resolve?year=2022&make=Toyota&model=Camry
 *
 * 按名字反查 makeId / modelId。给 "Popular vehicles" 用 —— 前端硬编码的是
 * 年份 + 品牌名 + 车型名, 但级联下拉需要 id, 这里把名字换成 id。
 *
 * 返回: { makeId, modelId }  或 404 (库里没有这个组合)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const year = Number(sp.get("year"));
  const make = sp.get("make");
  const model = sp.get("model");

  if (!Number.isInteger(year) || year <= 0 || !make || !model) {
    return NextResponse.json(
      { error: "Query must include ?year=<int>&make=<name>&model=<name>" },
      { status: 400 }
    );
  }

  // 一次查到 make+model 对应的 BaseVehicle (year+makeName+modelName 唯一确定)
  const base = await prisma.vcdbBaseVehicle.findFirst({
    where: { yearId: year, make: { name: make }, model: { name: model } },
    select: { makeId: true, modelId: true },
  });

  if (!base) {
    return NextResponse.json(
      { error: `No vehicle found for ${year} ${make} ${model}` },
      { status: 404 }
    );
  }

  return NextResponse.json({ makeId: base.makeId, modelId: base.modelId });
}
