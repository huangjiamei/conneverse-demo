/**
 * GET /api/vehicles/config?vehicleId=123      (选到具体 sub-model)
 *   或 GET /api/vehicles/config?baseVehicleId=456  (选了 "All submodels")
 *
 * 返回该车可选的 engine / drive 候选, 供前端在 sub-model 之后再加两级下拉。
 * 复用已有的 resolveVehicleConfig (src/lib/vehicle/vcdb-config.ts) —— 它本来就一次
 * 拉全 9 类配置; 这里只把 engines / driveTypes 返给前端 (其余 7 类留给第 2 档, 暂不返)。
 *
 * "All submodels" (只有 baseVehicleId) 情形: 取该 base 下**全部 submodel 的并集** ——
 * 同一 Y/M/M 不同 submodel 的发动机常常不同, 必须合并去重才不漏候选。
 *
 * 返回: { engines: [{ engineConfigId, label, liter, cylinders, fuelType }],
 *        drives:  [{ driveTypeId, label }] }
 *   engine label = 人读串 (如 "2.0L L4 GAS Naturally Aspirated"); drive label = FWD/RWD/AWD/4WD。
 *   engine 的结构分量 (liter/cylinders/fuelType) 给前端做 VIN→engine 唯一匹配预选用。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveVehicleConfig } from "@/lib/vehicle/vcdb-config";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const vehicleId = sp.get("vehicleId") != null ? Number(sp.get("vehicleId")) : null;
  const baseVehicleId = sp.get("baseVehicleId") != null ? Number(sp.get("baseVehicleId")) : null;

  const validVehicle = vehicleId != null && Number.isInteger(vehicleId) && vehicleId > 0;
  const validBase = baseVehicleId != null && Number.isInteger(baseVehicleId) && baseVehicleId > 0;
  if (!validVehicle && !validBase) {
    return NextResponse.json(
      { error: "Query must include ?vehicleId=<int> or ?baseVehicleId=<int>" },
      { status: 400 }
    );
  }

  // 要解析哪些 vehicle: 具体车就一辆; "All" 则该 base 下全部 submodel。
  let vehicleIds: number[];
  if (validVehicle) {
    vehicleIds = [vehicleId!];
  } else {
    const vs = await prisma.vcdbVehicle.findMany({
      where: { baseVehicleId: baseVehicleId! },
      select: { id: true },
    });
    vehicleIds = vs.map((v) => v.id);
  }
  if (vehicleIds.length === 0) {
    return NextResponse.json({ engines: [], drives: [] });
  }

  const configs = await Promise.all(vehicleIds.map((id) => resolveVehicleConfig({ vehicleId: id })));

  // 并集去重。engine 按 **label** 去重 (而非 engineConfigId): VCdb 常有多个
  // EngineConfig 落到同一人读串 (差在功率/供油等前端不展示、eBay 也不区分的维度) ——
  // 按 id 去重会让下拉出现多个一模一样的选项, 还会让 VIN 唯一匹配失效。保留首个 id 即可
  // (下游只用 label 串; id 仅作下拉 key/预选)。drive 仍按 id 去重。
  const engineMap = new Map<
    string,
    { engineConfigId: number; liter: string | null; cylinders: string | null; fuelType: string }
  >();
  const driveMap = new Map<number, string>();
  for (const c of configs) {
    if (!c) continue;
    for (const e of c.engines)
      if (!engineMap.has(e.label))
        engineMap.set(e.label, {
          engineConfigId: e.engineConfigId,
          liter: e.liter,
          cylinders: e.cylinders,
          fuelType: e.fuelType,
        });
    for (const d of c.driveTypes) driveMap.set(d.driveTypeId, d.name);
  }

  const engines = [...engineMap]
    .map(([label, e]) => ({ engineConfigId: e.engineConfigId, label, liter: e.liter, cylinders: e.cylinders, fuelType: e.fuelType }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const drives = [...driveMap]
    .map(([driveTypeId, label]) => ({ driveTypeId, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return NextResponse.json({ engines, drives });
}
