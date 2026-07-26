/**
 * 导入 PcdbToEbayMapping 初稿 (240 行) 到 Postgres。
 *
 * 数据源: scripts/pcdb-to-ebay-mapping-draft.csv
 *   列: sub_id, sub_name, primary_ebay_id, primary_ebay_name,
 *       fallback_ebay_ids(;分隔), confidence, note
 *
 * 用 xlsx 读 CSV (note 列含逗号且带引号, 必须正规解析, 不能 naive split)。
 * 幂等: 先 deleteMany 再 createMany。none 行 (primary 空) 也存 (primaryEbayId=null)。
 *
 * 用法: npx tsx scripts/import-pcdb-ebay-mapping.ts
 */

import * as XLSX from "xlsx";
import { join } from "path";
import { prisma } from "../src/lib/prisma";

const CSV = join(process.cwd(), "scripts", "pcdb-to-ebay-mapping-draft.csv");

type Raw = {
  sub_id: number | string;
  sub_name?: string;
  primary_ebay_id?: number | string;
  primary_ebay_name?: string;
  fallback_ebay_ids?: number | string;
  confidence?: string;
  note?: string;
};

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseFallbacks(v: unknown): number[] {
  if (v === null || v === undefined || v === "") return [];
  return String(v)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n));
}

async function main() {
  const wb = XLSX.readFile(CSV);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // defval:"" 保证空单元格是 "" 而不是缺键
  const rows = XLSX.utils.sheet_to_json<Raw>(sheet, { defval: "" });

  const data = rows
    .filter((r) => toIntOrNull(r.sub_id) != null)
    .map((r) => ({
      subCategoryId: toIntOrNull(r.sub_id)!,
      primaryEbayId: toIntOrNull(r.primary_ebay_id),
      fallbackEbayIds: parseFallbacks(r.fallback_ebay_ids),
      confidence: String(r.confidence ?? "").trim() || "none",
      note: r.note ? String(r.note) : null,
    }));

  console.log(`[csv] parsed ${data.length} rows`);

  // 幂等清空 + 批量插入
  await prisma.pcdbToEbayMapping.deleteMany();
  await prisma.pcdbToEbayMapping.createMany({ data, skipDuplicates: true });

  // 汇总
  const total = await prisma.pcdbToEbayMapping.count();
  const noneCount = await prisma.pcdbToEbayMapping.count({
    where: { primaryEbayId: null },
  });
  const byConf = await prisma.pcdbToEbayMapping.groupBy({
    by: ["confidence"],
    _count: true,
  });

  console.log("\n=== Import summary ===");
  console.log(`  total:            ${total}   (expect 240)`);
  console.log(`  primaryEbayId=null: ${noneCount}   (expect 74)`);
  console.log(
    "  by confidence:    " +
      byConf
        .sort((a, b) => (b._count as number) - (a._count as number))
        .map((c) => `${c.confidence}=${c._count}`)
        .join("  ")
  );

  // 抽查 subCategoryId=123 (Bumper)
  const bumper = await prisma.pcdbToEbayMapping.findUnique({
    where: { subCategoryId: 123 },
  });
  console.log(
    `  #123 Bumper:      primary=${bumper?.primaryEbayId} fallback=[${bumper?.fallbackEbayIds}] conf=${bumper?.confidence}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
