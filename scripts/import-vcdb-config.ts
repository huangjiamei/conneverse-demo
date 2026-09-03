/**
 * 从本地 MySQL VCdb 库把【配置层】表导入到 Postgres (身份层见 import-vcdb.ts).
 *
 * 前提:
 *   1. 本地 MySQL 已跑, VCdb dump (North America Light Duty & Powersports) 已导入 database `vcdb`
 *   2. Prisma schema 已 migrate (配置层 Vcdb* 表已建好)
 *   3. 身份层已先跑过 import-vcdb.ts (VehicleTo* 链接表要 JOIN 已过滤的 Vehicle)
 *
 * 发动机走当前 "2" 后缀 schema: VehicleToEngineConfig.EngineConfigID → EngineConfig2
 *   → EngineBase2 → EngineBlock / EngineBoreStroke。
 * 链接表 (11 张) 同 import-vcdb.ts 的过滤: JOIN Vehicle→BaseVehicle→Model
 *   WHERE VehicleTypeID IN (5,6,7), 只导轻型车 (Car/Truck/Van), 天然剔除 powersports。
 * 配置/叶子表全量导入 (词表, 与车无关)。
 *
 * 只清【配置层这些表】—— 绝不动身份层 6 张 (Year/Make/Model/SubModel/BaseVehicle/Vehicle)。
 *
 * 用法:
 *   MYSQL_PASSWORD=你的密码 DATABASE_URL=<dev或prod> npx tsx scripts/import-vcdb-config.ts
 */

import mysql from "mysql2/promise";
import { prisma } from "../src/lib/prisma";

const MYSQL_HOST = process.env.MYSQL_HOST ?? "localhost";
const MYSQL_USER = process.env.MYSQL_USER ?? "root";
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;
const MYSQL_DB = process.env.MYSQL_DB ?? "vcdb";

// 只导入这三种 VehicleType (同 import-vcdb.ts)
const VEHICLE_TYPE_IDS = [5, 6, 7]; // Car, Truck, Van

// 批量 insert 到 Postgres 时的 chunk 大小
const CHUNK = 5000;

/**
 * 表映射 SPEC (列映射沿用已验证的 Config2 链路):
 *   delegate  Prisma 委托名 (prisma[delegate])
 *   table     MySQL 表名
 *   cols      [pg字段, MySQL列] —— 顺序无关, 按名映射
 *   link      true = VehicleTo* 链接表, 走 VehicleType 过滤
 */
type Spec = { delegate: string; table: string; cols: [string, string][]; link?: boolean };

// ---- 配置 / 叶子表 (全量) ----
const CONFIG_TABLES: Spec[] = [
  // 发动机 (EngineConfig2 链)
  { delegate: "vcdbEngineBlock", table: "EngineBlock", cols: [["id", "EngineBlockID"], ["liter", "Liter"], ["cc", "CC"], ["cid", "CID"], ["cylinders", "Cylinders"], ["blockType", "BlockType"]] },
  { delegate: "vcdbEngineBoreStroke", table: "EngineBoreStroke", cols: [["id", "EngineBoreStrokeID"], ["boreIn", "EngBoreIn"], ["boreMetric", "EngBoreMetric"], ["strokeIn", "EngStrokeIn"], ["strokeMetric", "EngStrokeMetric"]] },
  { delegate: "vcdbEngineBase", table: "EngineBase2", cols: [["id", "EngineBaseID"], ["engineBlockId", "EngineBlockID"], ["engineBoreStrokeId", "EngineBoreStrokeID"]] },
  { delegate: "vcdbAspiration", table: "Aspiration", cols: [["id", "AspirationID"], ["name", "AspirationName"]] },
  { delegate: "vcdbCylinderHeadType", table: "CylinderHeadType", cols: [["id", "CylinderHeadTypeID"], ["name", "CylinderHeadTypeName"]] },
  { delegate: "vcdbFuelType", table: "FuelType", cols: [["id", "FuelTypeID"], ["name", "FuelTypeName"]] },
  { delegate: "vcdbFuelDeliveryType", table: "FuelDeliveryType", cols: [["id", "FuelDeliveryTypeID"], ["name", "FuelDeliveryTypeName"]] },
  { delegate: "vcdbFuelDeliverySubType", table: "FuelDeliverySubType", cols: [["id", "FuelDeliverySubTypeID"], ["name", "FuelDeliverySubTypeName"]] },
  { delegate: "vcdbFuelSystemControlType", table: "FuelSystemControlType", cols: [["id", "FuelSystemControlTypeID"], ["name", "FuelSystemControlTypeName"]] },
  { delegate: "vcdbFuelSystemDesign", table: "FuelSystemDesign", cols: [["id", "FuelSystemDesignID"], ["name", "FuelSystemDesignName"]] },
  { delegate: "vcdbFuelDeliveryConfig", table: "FuelDeliveryConfig", cols: [["id", "FuelDeliveryConfigID"], ["fuelDeliveryTypeId", "FuelDeliveryTypeID"], ["fuelDeliverySubTypeId", "FuelDeliverySubTypeID"], ["fuelSystemControlTypeId", "FuelSystemControlTypeID"], ["fuelSystemDesignId", "FuelSystemDesignID"]] },
  { delegate: "vcdbIgnitionSystemType", table: "IgnitionSystemType", cols: [["id", "IgnitionSystemTypeID"], ["name", "IgnitionSystemTypeName"]] },
  { delegate: "vcdbValves", table: "Valves", cols: [["id", "ValvesID"], ["valvesPerEngine", "ValvesPerEngine"]] },
  { delegate: "vcdbEngineDesignation", table: "EngineDesignation", cols: [["id", "EngineDesignationID"], ["name", "EngineDesignationName"]] },
  { delegate: "vcdbEngineVin", table: "EngineVIN", cols: [["id", "EngineVINID"], ["code", "EngineVINName"]] },
  { delegate: "vcdbEngineVersion", table: "EngineVersion", cols: [["id", "EngineVersionID"], ["version", "EngineVersion"]] },
  { delegate: "vcdbPowerOutput", table: "PowerOutput", cols: [["id", "PowerOutputID"], ["horsePower", "HorsePower"], ["kilowattPower", "KilowattPower"]] },
  { delegate: "vcdbMfr", table: "Mfr", cols: [["id", "MfrID"], ["name", "MfrName"]] },
  { delegate: "vcdbEngineConfig", table: "EngineConfig2", cols: [["id", "EngineConfigID"], ["engineBaseId", "EngineBaseID"], ["engineBlockId", "EngineBlockID"], ["engineBoreStrokeId", "EngineBoreStrokeID"], ["aspirationId", "AspirationID"], ["cylinderHeadTypeId", "CylinderHeadTypeID"], ["fuelTypeId", "FuelTypeID"], ["fuelDeliveryConfigId", "FuelDeliveryConfigID"], ["ignitionSystemTypeId", "IgnitionSystemTypeID"], ["engineMfrId", "EngineMfrID"], ["engineVersionId", "EngineVersionID"], ["powerOutputId", "PowerOutputID"], ["engineDesignationId", "EngineDesignationID"], ["engineVinId", "EngineVINID"], ["valvesId", "ValvesID"]] },
  // 变速
  { delegate: "vcdbTransmissionType", table: "TransmissionType", cols: [["id", "TransmissionTypeID"], ["name", "TransmissionTypeName"]] },
  { delegate: "vcdbTransmissionNumSpeeds", table: "TransmissionNumSpeeds", cols: [["id", "TransmissionNumSpeedsID"], ["speeds", "TransmissionNumSpeeds"]] },
  { delegate: "vcdbTransmissionControlType", table: "TransmissionControlType", cols: [["id", "TransmissionControlTypeID"], ["name", "TransmissionControlTypeName"]] },
  { delegate: "vcdbTransmissionMfrCode", table: "TransmissionMfrCode", cols: [["id", "TransmissionMfrCodeID"], ["code", "TransmissionMfrCode"]] },
  { delegate: "vcdbElecControlled", table: "ElecControlled", cols: [["id", "ElecControlledID"], ["value", "ElecControlled"]] },
  { delegate: "vcdbTransmissionBase", table: "TransmissionBase", cols: [["id", "TransmissionBaseID"], ["transmissionTypeId", "TransmissionTypeID"], ["transmissionNumSpeedsId", "TransmissionNumSpeedsID"], ["transmissionControlTypeId", "TransmissionControlTypeID"]] },
  { delegate: "vcdbTransmission", table: "Transmission", cols: [["id", "TransmissionID"], ["transmissionBaseId", "TransmissionBaseID"], ["transmissionMfrCodeId", "TransmissionMfrCodeID"], ["transmissionElecControlledId", "TransmissionElecControlledID"], ["transmissionMfrId", "TransmissionMfrID"]] },
  // 驱动 / 刹车 / 车身 / 货箱 / 轴距 / 悬挂 / 转向 / 其它
  { delegate: "vcdbDriveType", table: "DriveType", cols: [["id", "DriveTypeID"], ["name", "DriveTypeName"]] },
  { delegate: "vcdbBrakeType", table: "BrakeType", cols: [["id", "BrakeTypeID"], ["name", "BrakeTypeName"]] },
  { delegate: "vcdbBrakeSystem", table: "BrakeSystem", cols: [["id", "BrakeSystemID"], ["name", "BrakeSystemName"]] },
  { delegate: "vcdbBrakeAbs", table: "BrakeABS", cols: [["id", "BrakeABSID"], ["name", "BrakeABSName"]] },
  { delegate: "vcdbBrakeConfig", table: "BrakeConfig", cols: [["id", "BrakeConfigID"], ["frontBrakeTypeId", "FrontBrakeTypeID"], ["rearBrakeTypeId", "RearBrakeTypeID"], ["brakeSystemId", "BrakeSystemID"], ["brakeAbsId", "BrakeABSID"]] },
  { delegate: "vcdbBodyType", table: "BodyType", cols: [["id", "BodyTypeID"], ["name", "BodyTypeName"]] },
  { delegate: "vcdbBodyNumDoors", table: "BodyNumDoors", cols: [["id", "BodyNumDoorsID"], ["numDoors", "BodyNumDoors"]] },
  { delegate: "vcdbBodyStyleConfig", table: "BodyStyleConfig", cols: [["id", "BodyStyleConfigID"], ["bodyNumDoorsId", "BodyNumDoorsID"], ["bodyTypeId", "BodyTypeID"]] },
  { delegate: "vcdbBedLength", table: "BedLength", cols: [["id", "BedLengthID"], ["bedLength", "BedLength"], ["bedLengthMetric", "BedLengthMetric"]] },
  { delegate: "vcdbBedType", table: "BedType", cols: [["id", "BedTypeID"], ["name", "BedTypeName"]] },
  { delegate: "vcdbBedConfig", table: "BedConfig", cols: [["id", "BedConfigID"], ["bedLengthId", "BedLengthID"], ["bedTypeId", "BedTypeID"]] },
  { delegate: "vcdbWheelBase", table: "WheelBase", cols: [["id", "WheelBaseID"], ["wheelBase", "WheelBase"], ["wheelBaseMetric", "WheelBaseMetric"]] },
  { delegate: "vcdbSpringType", table: "SpringType", cols: [["id", "SpringTypeID"], ["name", "SpringTypeName"]] },
  { delegate: "vcdbSpringTypeConfig", table: "SpringTypeConfig", cols: [["id", "SpringTypeConfigID"], ["frontSpringTypeId", "FrontSpringTypeID"], ["rearSpringTypeId", "RearSpringTypeID"]] },
  { delegate: "vcdbSteeringType", table: "SteeringType", cols: [["id", "SteeringTypeID"], ["name", "SteeringTypeName"]] },
  { delegate: "vcdbSteeringSystem", table: "SteeringSystem", cols: [["id", "SteeringSystemID"], ["name", "SteeringSystemName"]] },
  { delegate: "vcdbSteeringConfig", table: "SteeringConfig", cols: [["id", "SteeringConfigID"], ["steeringTypeId", "SteeringTypeID"], ["steeringSystemId", "SteeringSystemID"]] },
  { delegate: "vcdbMfrBodyCode", table: "MfrBodyCode", cols: [["id", "MfrBodyCodeID"], ["name", "MfrBodyCodeName"]] },
  { delegate: "vcdbClass", table: "Class", cols: [["id", "ClassID"], ["name", "ClassName"]] },
  { delegate: "vcdbRegion", table: "Region", cols: [["id", "RegionID"], ["abbr", "RegionAbbr"], ["name", "RegionName"]] },
];

// ---- Vehicle → 配置 链接表 (11 张, 走 VehicleType 过滤) ----
const LINK_TABLES: Spec[] = [
  { delegate: "vcdbVehicleToEngineConfig", table: "VehicleToEngineConfig", cols: [["id", "VehicleToEngineConfigID"], ["vehicleId", "VehicleID"], ["engineConfigId", "EngineConfigID"]], link: true },
  { delegate: "vcdbVehicleToTransmission", table: "VehicleToTransmission", cols: [["id", "VehicleToTransmissionID"], ["vehicleId", "VehicleID"], ["transmissionId", "TransmissionID"]], link: true },
  { delegate: "vcdbVehicleToDriveType", table: "VehicleToDriveType", cols: [["id", "VehicleToDriveTypeID"], ["vehicleId", "VehicleID"], ["driveTypeId", "DriveTypeID"]], link: true },
  { delegate: "vcdbVehicleToBrakeConfig", table: "VehicleToBrakeConfig", cols: [["id", "VehicleToBrakeConfigID"], ["vehicleId", "VehicleID"], ["brakeConfigId", "BrakeConfigID"]], link: true },
  { delegate: "vcdbVehicleToBodyStyleConfig", table: "VehicleToBodyStyleConfig", cols: [["id", "VehicleToBodyStyleConfigID"], ["vehicleId", "VehicleID"], ["bodyStyleConfigId", "BodyStyleConfigID"]], link: true },
  { delegate: "vcdbVehicleToBedConfig", table: "VehicleToBedConfig", cols: [["id", "VehicleToBedConfigID"], ["vehicleId", "VehicleID"], ["bedConfigId", "BedConfigID"]], link: true },
  { delegate: "vcdbVehicleToWheelBase", table: "VehicleToWheelBase", cols: [["id", "VehicleToWheelBaseID"], ["vehicleId", "VehicleID"], ["wheelBaseId", "WheelBaseID"]], link: true },
  { delegate: "vcdbVehicleToSpringTypeConfig", table: "VehicleToSpringTypeConfig", cols: [["id", "VehicleToSpringTypeConfigID"], ["vehicleId", "VehicleID"], ["springTypeConfigId", "SpringTypeConfigID"]], link: true },
  { delegate: "vcdbVehicleToSteeringConfig", table: "VehicleToSteeringConfig", cols: [["id", "VehicleToSteeringConfigID"], ["vehicleId", "VehicleID"], ["steeringConfigId", "SteeringConfigID"]], link: true },
  { delegate: "vcdbVehicleToMfrBodyCode", table: "VehicleToMfrBodyCode", cols: [["id", "VehicleToMfrBodyCodeID"], ["vehicleId", "VehicleID"], ["mfrBodyCodeId", "MfrBodyCodeID"]], link: true },
  { delegate: "vcdbVehicleToClass", table: "VehicleToClass", cols: [["id", "VehicleToClassID"], ["vehicleId", "VehicleID"], ["classId", "ClassID"]], link: true },
];

const ALL = [...CONFIG_TABLES, ...LINK_TABLES];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (name: string) => (prisma as any)[name] as {
  deleteMany: () => Promise<unknown>;
  createMany: (a: { data: Record<string, unknown>[] }) => Promise<unknown>;
  count: () => Promise<number>;
};

/** MySQL 行 → Prisma data。NOT NULL Int 外键 (pg 字段以 Id 结尾) 缺失时兜底 0, 保持能跑; 其余保留 NULL。 */
function mapRow(row: mysql.RowDataPacket, cols: [string, string][]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [pg, my] of cols) {
    const v = row[my];
    out[pg] = v == null && pg !== "id" && pg.endsWith("Id") ? 0 : v;
  }
  return out;
}

function buildSelect(spec: Spec): string {
  const sel = spec.cols.map(([, my]) => (spec.link ? `x.\`${my}\`` : `\`${my}\``)).join(", ");
  if (!spec.link) return `SELECT ${sel} FROM \`${spec.table}\``;
  return `SELECT ${sel}
    FROM \`${spec.table}\` x
    JOIN Vehicle v ON v.VehicleID = x.VehicleID
    JOIN BaseVehicle bv ON v.BaseVehicleID = bv.BaseVehicleID
    JOIN Model m ON bv.ModelID = m.ModelID
    WHERE m.VehicleTypeID IN (${VEHICLE_TYPE_IDS.join(",")})`;
}

async function main() {
  if (!MYSQL_PASSWORD) {
    console.error("Error: MYSQL_PASSWORD env var not set");
    process.exit(1);
  }

  console.log("[mysql] connecting...");
  const my = await mysql.createConnection({
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DB,
  });

  try {
    // ---------- 清空【配置层这些表】(幂等)。绝不动身份层 6 张 ----------
    console.log("[postgres] clearing existing Vcdb config-layer data...");
    // 先删链接表, 再删配置表 (无 Prisma relation, 顺序其实无所谓, 稳妥起见)
    for (const spec of [...LINK_TABLES, ...CONFIG_TABLES]) {
      await delegate(spec.delegate).deleteMany();
    }

    // ---------- 导入每张表 ----------
    for (const spec of ALL) {
      const [rows] = await my.query<mysql.RowDataPacket[]>(buildSelect(spec));
      await chunkInsert(spec.table, rows, (chunk) =>
        delegate(spec.delegate).createMany({
          data: chunk.map((r) => mapRow(r, spec.cols)),
        })
      );
      console.log(`  ${spec.table}: ${rows.length}`);
    }

    // ---------- 汇总 (替代 verify) ----------
    console.log("\n=== Import summary (config layer) ===");
    for (const spec of ALL) {
      const c = await delegate(spec.delegate).count();
      console.log(`  ${spec.delegate.padEnd(30)} ${c}`);
    }
  } finally {
    await my.end();
    await prisma.$disconnect();
  }
}

// ============================================================
// 通用: 分批 insert (同 import-vcdb.ts)
// ============================================================
async function chunkInsert<T>(
  label: string,
  rows: T[],
  insertFn: (chunk: T[]) => Promise<unknown>
): Promise<void> {
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await insertFn(chunk);
    done += chunk.length;
    if (done % (CHUNK * 4) === 0 || done === rows.length) {
      console.log(`  ${label}: ${done} / ${rows.length}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
