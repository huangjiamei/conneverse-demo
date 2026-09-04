/**
 * 从本地 MySQL PCdb 库把位置(Position)2 张表导入到 Postgres。
 * (import-pcdb.ts 只导了 Category/SubCategory/Part/PartCategory, 位置层缺失, 这里补上。)
 *
 * 前提:
 *   1. 本地 MySQL 已跑, PCdb dump 已导入 database `pcdb`
 *   2. Prisma schema 已 migrate (PcdbPosition / PcdbPartPosition 已建好)
 *
 * 与车辆无关, 全量导入。桥: PartPosition.PartTerminologyID → PcdbPart.id。
 * 只清【这 2 张表】(幂等), 不动 import-pcdb.ts 管的那几张。
 *
 * 用法:
 *   MYSQL_PASSWORD=你的密码 DATABASE_URL=<dev或prod> npx tsx scripts/import-pcdb-positions.ts
 */

import mysql from "mysql2/promise";
import { prisma } from "../src/lib/prisma";

const MYSQL_HOST = process.env.MYSQL_HOST ?? "localhost";
const MYSQL_USER = process.env.MYSQL_USER ?? "root";
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;
const MYSQL_DB = process.env.MYSQL_DB ?? "pcdb";

const CHUNK = 5000;

type Spec = { delegate: string; table: string; cols: [string, string][] };

const TABLES: Spec[] = [
  { delegate: "pcdbPosition", table: "Positions", cols: [["id", "PositionID"], ["position", "Position"]] },
  { delegate: "pcdbPartPosition", table: "PartPosition", cols: [["id", "PartPositionID"], ["partTerminologyId", "PartTerminologyID"], ["positionId", "PositionID"]] },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (name: string) => (prisma as any)[name] as {
  deleteMany: () => Promise<unknown>;
  createMany: (a: { data: Record<string, unknown>[] }) => Promise<unknown>;
  count: () => Promise<number>;
};

/** NOT NULL Int 外键 (pg 字段以 Id 结尾) 缺失时兜底 0; 其余保留 NULL。 */
function mapRow(row: mysql.RowDataPacket, spec: Spec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [pg, my] of spec.cols) {
    const v = row[my];
    out[pg] = v == null && pg !== "id" && pg.endsWith("Id") ? 0 : v;
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
    // ---------- 清空【这 2 张表】(幂等) ----------
    console.log("[postgres] clearing existing Pcdb position data...");
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
    console.log("\n=== Import summary (PCdb positions) ===");
    for (const spec of TABLES) {
      console.log(`  ${spec.delegate.padEnd(20)} ${await delegate(spec.delegate).count()}`);
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
