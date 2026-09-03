/**
 * resolveVehicleConfig —— 把 VCdb 配置层 (scalar + index, 无 relation) 变成可消费结构。
 *
 * 给一台 VcdbVehicle (= BaseVehicle × SubModel), 沿各自的 VehicleTo* 链接表手写 join,
 * 返回该车全部维度的合法配置。engine 展开到人类可读
 * (EngineConfig2 → EngineBlock/Aspiration/FuelType, 如 "5.3L V8 GAS Naturally Aspirated")。
 *
 * 性能: 每个维度都是 `VehicleToX WHERE vehicleId = $1` (链接表上有 @@index([vehicleId])),
 * 再按 PK join 到 config/leaf —— 全是索引/主键查找; 单车一次调用 ~12 条小查询, 并发跑。
 */

import { prisma } from "@/lib/prisma";

export type Engine = {
  engineConfigId: number;
  liter: string | null;
  cc: string | null;
  cid: string | null;
  cylinders: string | null;
  blockType: string | null;
  aspiration: string;
  fuelType: string;
  label: string; // "5.3L V8 GAS Naturally Aspirated"
};
export type Transmission = {
  transmissionId: number;
  type: string;
  speeds: string;
  controlType: string;
  label: string; // "6-speed Automatic"
};
export type DriveType = { driveTypeId: number; name: string };
export type BrakeConfig = {
  brakeConfigId: number;
  front: string;
  rear: string;
  system: string;
  abs: string;
};
export type BodyStyleConfig = {
  bodyStyleConfigId: number;
  bodyType: string;
  numDoors: string;
};
export type BedConfig = {
  bedConfigId: number;
  bedLength: string | null;
  bedLengthMetric: string | null;
  bedType: string;
};
export type WheelBase = {
  wheelBaseId: number;
  wheelBase: string | null;
  wheelBaseMetric: string | null;
};
export type SpringTypeConfig = {
  springTypeConfigId: number;
  front: string;
  rear: string;
};
export type SteeringConfig = {
  steeringConfigId: number;
  type: string;
  system: string;
};
export type MfrBodyCode = { mfrBodyCodeId: number; name: string };

export type VehicleConfig = {
  vehicleId: number;
  baseVehicleId: number;
  year: number;
  makeId: number;
  make: string;
  modelId: number;
  model: string;
  submodelId: number;
  submodel: string;
  engines: Engine[];
  transmissions: Transmission[];
  driveTypes: DriveType[];
  brakeConfigs: BrakeConfig[];
  bodyStyleConfigs: BodyStyleConfig[];
  bedConfigs: BedConfig[];
  wheelBases: WheelBase[];
  springTypeConfigs: SpringTypeConfig[];
  steeringConfigs: SteeringConfig[];
  mfrBodyCodes: MfrBodyCode[];
  classes: string[];
};

type IdentityRow = {
  id: number;
  baseVehicleId: number;
  yearId: number;
  makeId: number;
  make: string;
  modelId: number;
  model: string;
  subModelId: number;
  submodel: string;
};

const q = <T>(sql: string, vehicleId: number) =>
  prisma.$queryRawUnsafe<T[]>(sql, vehicleId);

function engineLabel(e: Omit<Engine, "label">): string {
  const cyl = e.blockType && e.cylinders ? `${e.blockType}${e.cylinders}` : "";
  return [e.liter ? `${e.liter}L` : "", cyl, e.fuelType, e.aspiration]
    .filter(Boolean)
    .join(" ");
}

/** 解析一台车的完整配置。传 vehicleId, 或 baseVehicleId + submodelId。 */
export async function resolveVehicleConfig(
  input: { vehicleId: number } | { baseVehicleId: number; submodelId: number }
): Promise<VehicleConfig | null> {
  let vehicleId: number;
  if ("vehicleId" in input) {
    vehicleId = input.vehicleId;
  } else {
    const row = await prisma.vcdbVehicle.findFirst({
      where: { baseVehicleId: input.baseVehicleId, subModelId: input.submodelId },
      select: { id: true },
    });
    if (!row) return null;
    vehicleId = row.id;
  }

  const [identity] = await q<IdentityRow>(
    `SELECT v.id, v."baseVehicleId", bv."yearId", bv."makeId", mk.name AS make,
            bv."modelId", md.name AS model, v."subModelId", sm.name AS submodel
     FROM "VcdbVehicle" v
     JOIN "VcdbBaseVehicle" bv ON bv.id = v."baseVehicleId"
     JOIN "VcdbMake" mk ON mk.id = bv."makeId"
     JOIN "VcdbModel" md ON md.id = bv."modelId"
     JOIN "VcdbSubModel" sm ON sm.id = v."subModelId"
     WHERE v.id = $1`,
    vehicleId
  );
  if (!identity) return null;

  const [
    engineRows,
    transmissions,
    driveTypes,
    brakeConfigs,
    bodyStyleConfigs,
    bedConfigs,
    wheelBases,
    springTypeConfigs,
    steeringConfigs,
    mfrBodyCodes,
    classRows,
  ] = await Promise.all([
    q<Omit<Engine, "label">>(
      `SELECT ec.id AS "engineConfigId", eb.liter, eb.cc, eb.cid, eb.cylinders,
              eb."blockType", asp.name AS aspiration, ft.name AS "fuelType"
       FROM "VcdbVehicleToEngineConfig" ve
       JOIN "VcdbEngineConfig" ec ON ec.id = ve."engineConfigId"
       JOIN "VcdbEngineBlock" eb ON eb.id = ec."engineBlockId"
       JOIN "VcdbAspiration" asp ON asp.id = ec."aspirationId"
       JOIN "VcdbFuelType" ft ON ft.id = ec."fuelTypeId"
       WHERE ve."vehicleId" = $1`,
      vehicleId
    ),
    q<Transmission>(
      `SELECT t.id AS "transmissionId", tt.name AS type, tns.speeds AS speeds,
              tct.name AS "controlType",
              (tns.speeds || '-speed ' || tct.name) AS label
       FROM "VcdbVehicleToTransmission" vt
       JOIN "VcdbTransmission" t ON t.id = vt."transmissionId"
       JOIN "VcdbTransmissionBase" tb ON tb.id = t."transmissionBaseId"
       JOIN "VcdbTransmissionType" tt ON tt.id = tb."transmissionTypeId"
       JOIN "VcdbTransmissionNumSpeeds" tns ON tns.id = tb."transmissionNumSpeedsId"
       JOIN "VcdbTransmissionControlType" tct ON tct.id = tb."transmissionControlTypeId"
       WHERE vt."vehicleId" = $1`,
      vehicleId
    ),
    q<DriveType>(
      `SELECT dt.id AS "driveTypeId", dt.name
       FROM "VcdbVehicleToDriveType" vd
       JOIN "VcdbDriveType" dt ON dt.id = vd."driveTypeId"
       WHERE vd."vehicleId" = $1`,
      vehicleId
    ),
    q<BrakeConfig>(
      `SELECT bc.id AS "brakeConfigId", fbt.name AS front, rbt.name AS rear,
              bs.name AS system, abs.name AS abs
       FROM "VcdbVehicleToBrakeConfig" vb
       JOIN "VcdbBrakeConfig" bc ON bc.id = vb."brakeConfigId"
       JOIN "VcdbBrakeType" fbt ON fbt.id = bc."frontBrakeTypeId"
       JOIN "VcdbBrakeType" rbt ON rbt.id = bc."rearBrakeTypeId"
       JOIN "VcdbBrakeSystem" bs ON bs.id = bc."brakeSystemId"
       JOIN "VcdbBrakeAbs" abs ON abs.id = bc."brakeAbsId"
       WHERE vb."vehicleId" = $1`,
      vehicleId
    ),
    q<BodyStyleConfig>(
      `SELECT bsc.id AS "bodyStyleConfigId", bt.name AS "bodyType", bnd."numDoors"
       FROM "VcdbVehicleToBodyStyleConfig" vbs
       JOIN "VcdbBodyStyleConfig" bsc ON bsc.id = vbs."bodyStyleConfigId"
       JOIN "VcdbBodyType" bt ON bt.id = bsc."bodyTypeId"
       JOIN "VcdbBodyNumDoors" bnd ON bnd.id = bsc."bodyNumDoorsId"
       WHERE vbs."vehicleId" = $1`,
      vehicleId
    ),
    q<BedConfig>(
      `SELECT bedc.id AS "bedConfigId", bl."bedLength", bl."bedLengthMetric", bt.name AS "bedType"
       FROM "VcdbVehicleToBedConfig" vbc
       JOIN "VcdbBedConfig" bedc ON bedc.id = vbc."bedConfigId"
       JOIN "VcdbBedLength" bl ON bl.id = bedc."bedLengthId"
       JOIN "VcdbBedType" bt ON bt.id = bedc."bedTypeId"
       WHERE vbc."vehicleId" = $1`,
      vehicleId
    ),
    q<WheelBase>(
      `SELECT wb.id AS "wheelBaseId", wb."wheelBase", wb."wheelBaseMetric"
       FROM "VcdbVehicleToWheelBase" vw
       JOIN "VcdbWheelBase" wb ON wb.id = vw."wheelBaseId"
       WHERE vw."vehicleId" = $1`,
      vehicleId
    ),
    q<SpringTypeConfig>(
      `SELECT stc.id AS "springTypeConfigId", fs.name AS front, rs.name AS rear
       FROM "VcdbVehicleToSpringTypeConfig" vs
       JOIN "VcdbSpringTypeConfig" stc ON stc.id = vs."springTypeConfigId"
       JOIN "VcdbSpringType" fs ON fs.id = stc."frontSpringTypeId"
       JOIN "VcdbSpringType" rs ON rs.id = stc."rearSpringTypeId"
       WHERE vs."vehicleId" = $1`,
      vehicleId
    ),
    q<SteeringConfig>(
      `SELECT sc.id AS "steeringConfigId", st.name AS type, ss.name AS system
       FROM "VcdbVehicleToSteeringConfig" vsc
       JOIN "VcdbSteeringConfig" sc ON sc.id = vsc."steeringConfigId"
       JOIN "VcdbSteeringType" st ON st.id = sc."steeringTypeId"
       JOIN "VcdbSteeringSystem" ss ON ss.id = sc."steeringSystemId"
       WHERE vsc."vehicleId" = $1`,
      vehicleId
    ),
    q<MfrBodyCode>(
      `SELECT mbc.id AS "mfrBodyCodeId", mbc.name
       FROM "VcdbVehicleToMfrBodyCode" vm
       JOIN "VcdbMfrBodyCode" mbc ON mbc.id = vm."mfrBodyCodeId"
       WHERE vm."vehicleId" = $1`,
      vehicleId
    ),
    q<{ name: string }>(
      `SELECT c.name
       FROM "VcdbVehicleToClass" vc
       JOIN "VcdbClass" c ON c.id = vc."classId"
       WHERE vc."vehicleId" = $1`,
      vehicleId
    ),
  ]);

  const engines: Engine[] = engineRows.map((e) => ({ ...e, label: engineLabel(e) }));

  return {
    vehicleId: identity.id,
    baseVehicleId: identity.baseVehicleId,
    year: identity.yearId,
    makeId: identity.makeId,
    make: identity.make,
    modelId: identity.modelId,
    model: identity.model,
    submodelId: identity.subModelId,
    submodel: identity.submodel,
    engines,
    transmissions,
    driveTypes,
    brakeConfigs,
    bodyStyleConfigs,
    bedConfigs,
    wheelBases,
    springTypeConfigs,
    steeringConfigs,
    mfrBodyCodes,
    classes: classRows.map((c) => c.name),
  };
}

// ============================================================
// formatVehicleForEbay —— 整理成 eBay 适配 (checkCompatibility /
// getCompatibilityPropertyValues) 需要的字段形状, 为对齐 eBay 目录做准备。
//   Year / Make(全名) / Model(全名) / Trim(=SubModel) / Engine[]
// eBay 的 Engine/Trim/Model 需要"精确目录值", 这里给出候选串 + 结构分量,
// 下一步用 getCompatibilityPropertyValues 拉合法值再做字符串对齐。
// ============================================================

export type EbayVehicle = {
  year: string;
  make: string;
  model: string;
  trim: string; // SubModel
  engines: {
    liter: string | null;
    cid: string | null;
    cylinders: string | null;
    blockType: string | null;
    fuelType: string;
    aspiration: string;
    label: string; // "5.3L V8 GAS" —— 用来和 eBay Engine 目录值对齐的候选
  }[];
};

export function formatVehicleForEbay(config: VehicleConfig): EbayVehicle {
  return {
    year: String(config.year),
    make: config.make,
    model: config.model,
    trim: config.submodel,
    engines: config.engines.map((e) => ({
      liter: e.liter,
      cid: e.cid,
      cylinders: e.cylinders,
      blockType: e.blockType,
      fuelType: e.fuelType,
      aspiration: e.aspiration,
      // eBay Engine 常见形态更接近 "5.3L V8" —— 去掉 aspiration 的紧凑串
      label: [e.liter ? `${e.liter}L` : "", e.blockType && e.cylinders ? `${e.blockType}${e.cylinders}` : "", e.fuelType]
        .filter(Boolean)
        .join(" "),
    })),
  };
}
