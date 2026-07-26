/**
 * 从本地 MySQL PCdb 库把 3 张表 + 1 张关联表导入到 Postgres dev DB.
 *
 * 前提:
 *   1. 本地 MySQL 已跑, PCdb dump 已导入到 database `pcdb`
 *   2. Prisma schema 已 migrate (4 张 Pcdb* 表已建好)
 *
 * 期望条数: Categories 26 / SubCategories 240 / Parts 40464 / PartCategory 40464
 *
 * 用法:
 *   MYSQL_PASSWORD=你的密码 npx tsx scripts/import-pcdb.ts
 *   (可选: MYSQL_HOST / MYSQL_USER / MYSQL_DB 覆盖默认 localhost/root/pcdb)
 *
 * 标准 PCdb 列名 (若你的 dump 列名不同, 调下面的 SELECT):
 *   Categories(CategoryID, CategoryName)
 *   SubCategories(SubCategoryID, SubCategoryName)
 *   Parts(PartTerminologyID, PartTerminologyName)
 *   PartCategory(PartTerminologyID, CategoryID, SubCategoryID)
 */

import mysql from "mysql2/promise";
import { prisma } from "../src/lib/prisma";

const MYSQL_HOST = process.env.MYSQL_HOST ?? "localhost";
const MYSQL_USER = process.env.MYSQL_USER ?? "root";
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;
const MYSQL_DB = process.env.MYSQL_DB ?? "pcdb";

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
    // ---------- 清空 (幂等)。先删关联表 (它引用其余三张) ----------
    console.log("[postgres] clearing existing Pcdb data...");
    await prisma.pcdbPartCategory.deleteMany();
    await prisma.pcdbPart.deleteMany();
    await prisma.pcdbSubCategory.deleteMany();
    await prisma.pcdbCategory.deleteMany();

    // ---------- 1. Categories ----------
    console.log("[import] Categories...");
    const [categories] = await my.query<mysql.RowDataPacket[]>(
      `SELECT CategoryID, CategoryName FROM Categories ORDER BY CategoryID`
    );
    await prisma.pcdbCategory.createMany({
      data: categories.map((c) => ({ id: c.CategoryID, name: c.CategoryName ?? "" })),
    });
    console.log(`  ${categories.length} categories`);

    // ---------- 2. SubCategories ----------
    console.log("[import] SubCategories...");
    const [subcats] = await my.query<mysql.RowDataPacket[]>(
      `SELECT SubCategoryID, SubCategoryName FROM SubCategories ORDER BY SubCategoryID`
    );
    await prisma.pcdbSubCategory.createMany({
      data: subcats.map((s) => ({ id: s.SubCategoryID, name: s.SubCategoryName ?? "" })),
    });
    console.log(`  ${subcats.length} subcategories`);

    // ---------- 3. Parts (分批) ----------
    console.log("[import] Parts...");
    const [parts] = await my.query<mysql.RowDataPacket[]>(
      `SELECT PartTerminologyID, PartTerminologyName FROM Parts ORDER BY PartTerminologyID`
    );
    await chunkInsert("PcdbPart", parts, (chunk) =>
      prisma.pcdbPart.createMany({
        data: chunk.map((p) => ({
          id: p.PartTerminologyID,
          name: p.PartTerminologyName ?? "",
        })),
      })
    );

    // ---------- 4. PartCategory (关联表, 分批) ----------
    console.log("[import] PartCategory...");
    const [partCats] = await my.query<mysql.RowDataPacket[]>(
      `SELECT PartTerminologyID, CategoryID, SubCategoryID FROM PartCategory`
    );
    await chunkInsert("PcdbPartCategory", partCats, (chunk) =>
      prisma.pcdbPartCategory.createMany({
        data: chunk.map((pc) => ({
          partId: pc.PartTerminologyID,
          categoryId: pc.CategoryID,
          subCategoryId: pc.SubCategoryID,
        })),
        skipDuplicates: true, // @@unique([partId, categoryId, subCategoryId])
      })
    );

    // ---------- 汇总 ----------
    console.log("\n=== Import summary ===");
    const [catCount, subCount, partCount, pcCount] = await Promise.all([
      prisma.pcdbCategory.count(),
      prisma.pcdbSubCategory.count(),
      prisma.pcdbPart.count(),
      prisma.pcdbPartCategory.count(),
    ]);
    console.log(`  Categories:    ${catCount}   (expect 26)`);
    console.log(`  SubCategories: ${subCount}   (expect 240)`);
    console.log(`  Parts:         ${partCount}   (expect 40464)`);
    console.log(`  PartCategory:  ${pcCount}   (expect 40464)`);
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
