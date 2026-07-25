/**
 * 从本地 MySQL VCdb 库把 5 张核心表导入到 Postgres dev DB.
 *
 * 前提:
 *   1. 本地 MySQL 已跑, VCdb dump 已导入到 database `vcdb`
 *   2. Prisma schema 已 migrate (5 张 Vcdb* 表已建好)
 *
 * 只导入 VehicleType IN (5=Car, 6=Truck, 7=Van), 摩托车/雪地车/水上摩托跳过.
 *
 * 用法:
 *   MYSQL_PASSWORD=你的密码 npx tsx scripts/import-vcdb.ts
 */

import mysql from "mysql2/promise";
import { prisma } from "../src/lib/prisma";

const MYSQL_HOST = process.env.MYSQL_HOST ?? "localhost";
const MYSQL_USER = process.env.MYSQL_USER ?? "root";
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;
const MYSQL_DB = process.env.MYSQL_DB ?? "vcdb";

// 只导入这三种 VehicleType
const VEHICLE_TYPE_IDS = [5, 6, 7]; // Car, Truck, Van

// 批量 insert 到 Postgres 时的 chunk 大小
const CHUNK = 5000;

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
    // ---------- 清空现有 Vcdb 数据 (幂等) ----------
    console.log("[postgres] clearing existing Vcdb data...");
    await prisma.vcdbVehicle.deleteMany();
    await prisma.vcdbBaseVehicle.deleteMany();
    await prisma.vcdbSubModel.deleteMany();
    await prisma.vcdbModel.deleteMany();
    await prisma.vcdbMake.deleteMany();
    await prisma.vcdbYear.deleteMany();

    // ---------- 1. Year ----------
    // 只保留 Car/Truck/Van 用到的年份 (通过 BaseVehicle 关联)
    console.log("[import] Year...");
    const [years] = await my.query<mysql.RowDataPacket[]>(`
      SELECT DISTINCT y.YearID
      FROM Year y
      JOIN BaseVehicle bv ON bv.YearID = y.YearID
      JOIN Model m ON bv.ModelID = m.ModelID
      WHERE m.VehicleTypeID IN (${VEHICLE_TYPE_IDS.join(",")})
      ORDER BY y.YearID
    `);
    await prisma.vcdbYear.createMany({
      data: years.map((y) => ({ id: y.YearID })),
    });
    console.log(`  ${years.length} years`);

    // ---------- 2. Make ----------
    console.log("[import] Make...");
    const [makes] = await my.query<mysql.RowDataPacket[]>(`
      SELECT DISTINCT mk.MakeID, mk.MakeName
      FROM Make mk
      JOIN BaseVehicle bv ON bv.MakeID = mk.MakeID
      JOIN Model m ON bv.ModelID = m.ModelID
      WHERE m.VehicleTypeID IN (${VEHICLE_TYPE_IDS.join(",")})
      ORDER BY mk.MakeName
    `);
    await prisma.vcdbMake.createMany({
      data: makes.map((m) => ({ id: m.MakeID, name: m.MakeName })),
    });
    console.log(`  ${makes.length} makes`);

    // ---------- 3. Model ----------
    console.log("[import] Model...");
    const [models] = await my.query<mysql.RowDataPacket[]>(`
      SELECT ModelID, ModelName, VehicleTypeID
      FROM Model
      WHERE VehicleTypeID IN (${VEHICLE_TYPE_IDS.join(",")})
      ORDER BY ModelName
    `);
    await prisma.vcdbModel.createMany({
      data: models.map((m) => ({
        id: m.ModelID,
        name: m.ModelName ?? "",
        vehicleTypeId: m.VehicleTypeID,
      })),
    });
    console.log(`  ${models.length} models`);

    // ---------- 4. SubModel ----------
    // 只保留过滤后 Vehicle 用到的
    console.log("[import] SubModel...");
    const [subs] = await my.query<mysql.RowDataPacket[]>(`
      SELECT DISTINCT sm.SubModelID, sm.SubModelName
      FROM SubModel sm
      JOIN Vehicle v ON v.SubModelID = sm.SubModelID
      JOIN BaseVehicle bv ON v.BaseVehicleID = bv.BaseVehicleID
      JOIN Model m ON bv.ModelID = m.ModelID
      WHERE m.VehicleTypeID IN (${VEHICLE_TYPE_IDS.join(",")})
      ORDER BY sm.SubModelName
    `);
    await prisma.vcdbSubModel.createMany({
      data: subs.map((s) => ({ id: s.SubModelID, name: s.SubModelName })),
    });
    console.log(`  ${subs.length} submodels`);

    // ---------- 5. BaseVehicle (分批) ----------
    console.log("[import] BaseVehicle...");
    const [baseVehicles] = await my.query<mysql.RowDataPacket[]>(`
      SELECT bv.BaseVehicleID, bv.YearID, bv.MakeID, bv.ModelID
      FROM BaseVehicle bv
      JOIN Model m ON bv.ModelID = m.ModelID
      WHERE m.VehicleTypeID IN (${VEHICLE_TYPE_IDS.join(",")})
    `);
    await chunkInsert("VcdbBaseVehicle", baseVehicles, (chunk) =>
      prisma.vcdbBaseVehicle.createMany({
        data: chunk.map((bv) => ({
          id: bv.BaseVehicleID,
          yearId: bv.YearID,
          makeId: bv.MakeID,
          modelId: bv.ModelID,
        })),
      })
    );

    // ---------- 6. Vehicle (分批, 数据最大) ----------
    console.log("[import] Vehicle...");
    const [vehicles] = await my.query<mysql.RowDataPacket[]>(`
      SELECT v.VehicleID, v.BaseVehicleID, v.SubModelID
      FROM Vehicle v
      JOIN BaseVehicle bv ON v.BaseVehicleID = bv.BaseVehicleID
      JOIN Model m ON bv.ModelID = m.ModelID
      WHERE m.VehicleTypeID IN (${VEHICLE_TYPE_IDS.join(",")})
    `);
    await chunkInsert("VcdbVehicle", vehicles, (chunk) =>
      prisma.vcdbVehicle.createMany({
        data: chunk.map((v) => ({
          id: v.VehicleID,
          baseVehicleId: v.BaseVehicleID,
          subModelId: v.SubModelID,
        })),
      })
    );

    // ---------- 汇总 ----------
    console.log("\n=== Import summary ===");
    const [
      yearCount,
      makeCount,
      modelCount,
      subCount,
      bvCount,
      vCount,
    ] = await Promise.all([
      prisma.vcdbYear.count(),
      prisma.vcdbMake.count(),
      prisma.vcdbModel.count(),
      prisma.vcdbSubModel.count(),
      prisma.vcdbBaseVehicle.count(),
      prisma.vcdbVehicle.count(),
    ]);
    console.log(`  Years:        ${yearCount}`);
    console.log(`  Makes:        ${makeCount}`);
    console.log(`  Models:       ${modelCount}`);
    console.log(`  SubModels:    ${subCount}`);
    console.log(`  BaseVehicles: ${bvCount}`);
    console.log(`  Vehicles:     ${vCount}`);
  } finally {
    await my.end();
    await prisma.$disconnect();
  }
}

// ============================================================
// 通用: 分批 insert
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });