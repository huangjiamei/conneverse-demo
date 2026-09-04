/**
 * 从本地 MySQL PAdb 库把 7 张表导入到 Postgres (零件属性层)。
 *
 * 前提:
 *   1. 本地 MySQL 已跑, PAdb dump 已导入 database `padb` (库名可用 MYSQL_PADB_DB 覆盖)
 *   2. Prisma schema 已 migrate (Padb* 7 张表已建好)
 *
 * PAdb 是属性词表 + 合法取值 + 适用关系, 与车辆无关 → 全量导入, 不按车过滤。
 * 桥: PartAttributeAssignment.PartTerminologyID → PcdbPart.id, PAPTID 是"零件×属性"唯一键。
 *
 * 只清【这 7 张 Padb 表】(幂等), 不动别的表。
 *
 * 用法:
 *   MYSQL_PASSWORD=你的密码 DATABASE_URL=<dev或prod> npx tsx scripts/import-padb.ts
 */

import mysql from "mysql2/promise";
import { prisma } from "../src/lib/prisma";

const MYSQL_HOST = process.env.MYSQL_HOST ?? "localhost";
const MYSQL_USER = process.env.MYSQL_USER ?? "root";
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;
const MYSQL_DB = process.env.MYSQL_PADB_DB ?? "padb";

const CHUNK = 5000;

/** delegate=Prisma 委托名; table=MySQL 表; cols=[pg字段, MySQL列]; nullable=可空的 Int 列(不兜底 0) */
type Spec = { delegate: string; table: string; cols: [string, string][]; nullable?: string[] };

const TABLES: Spec[] = [
  { delegate: "padbPartAttribute", table: "PartAttributes", cols: [["id", "PAID"], ["name", "PAName"], ["description", "PADescription"]] },
  { delegate: "padbMetaData", table: "MetaData", cols: [["id", "MetaID"], ["name", "MetaName"], ["dataType", "DataType"]] },
  { delegate: "padbValidValue", table: "ValidValues", cols: [["id", "ValidValueID"], ["value", "ValidValue"]] },
  { delegate: "padbMetaUom", table: "MetaUOMCodes", cols: [["id", "MetaUOMID"], ["uomCode", "UOMCode"], ["uomLabel", "UOMLabel"], ["measurementGroupId", "MeasurementGroupID"]], nullable: ["measurementGroupId"] },
  { delegate: "padbPartAttributeAssignment", table: "PartAttributeAssignment", cols: [["id", "PAPTID"], ["partTerminologyId", "PartTerminologyID"], ["paid", "PAID"], ["metaId", "MetaID"]] },
  { delegate: "padbValidValueAssignment", table: "ValidValueAssignment", cols: [["id", "ValidValueAssignmentID"], ["paptid", "PAPTID"], ["validValueId", "ValidValueID"]] },
  { delegate: "padbMetaUomAssignment", table: "MetaUOMCodeAssignment", cols: [["id", "MetaUOMCodeAssignmentID"], ["paptid", "PAPTID"], ["metaUomId", "MetaUOMID"]] },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (name: string) => (prisma as any)[name] as {
  deleteMany: () => Promise<unknown>;
  createMany: (a: { data: Record<string, unknown>[] }) => Promise<unknown>;
  count: () => Promise<number>;
};

/** MySQL 行 → Prisma data。NOT NULL Int 外键 (pg 字段以 Id 结尾, 非可空列) 缺失时兜底 0; 其余保留 NULL。 */
function mapRow(row: mysql.RowDataPacket, spec: Spec): Record<string, unknown> {
  const nullable = new Set(spec.nullable ?? []);
  const out: Record<string, unknown> = {};
  for (const [pg, my] of spec.cols) {
    const v = row[my];
    out[pg] = v == null && pg !== "id" && pg.endsWith("Id") && !nullable.has(pg) ? 0 : v;
  }
  return out;
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
    // ---------- 清空【这 7 张 Padb 表】(幂等) ----------
    console.log("[postgres] clearing existing Padb data...");
    for (const spec of [...TABLES].reverse()) {
      await delegate(spec.delegate).deleteMany();
    }

    // ---------- 导入 ----------
    for (const spec of TABLES) {
      const sel = spec.cols.map(([, my]) => `\`${my}\``).join(", ");
      const [rows] = await my.query<mysql.RowDataPacket[]>(`SELECT ${sel} FROM \`${spec.table}\``);
      await chunkInsert(spec.table, rows, (chunk) =>
        delegate(spec.delegate).createMany({ data: chunk.map((r) => mapRow(r, spec)) })
      );
      console.log(`  ${spec.table}: ${rows.length}`);
    }

    // ---------- 汇总 ----------
    console.log("\n=== Import summary (PAdb) ===");
    for (const spec of TABLES) {
      console.log(`  ${spec.delegate.padEnd(30)} ${await delegate(spec.delegate).count()}`);
    }
  } finally {
    await my.end();
    await prisma.$disconnect();
  }
}

// ============================================================
// 通用: 分批 insert (同 import-vcdb-config.ts)
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
