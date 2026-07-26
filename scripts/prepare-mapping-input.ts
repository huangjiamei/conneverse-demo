/**
 * Step 3 输入数据准备: 从 Postgres 拉两份 CSV 到 scratchpad/。
 *
 *   scratchpad/pcdb-subcategories.csv
 *     240 个 Auto Care SubCategory + 各自归属的 Category (经 PartCategory 反查)。
 *     sub_category_id, sub_category_name, belongs_to_categories(多个用 ; 隔开)
 *
 *   scratchpad/ebay-leaves.csv
 *     Car & Truck Parts & Accessories 子树下所有 isLeaf=true 的类目。
 *     ebay_id, ebay_name, ebay_path
 *
 * 只读, 不改 schema, 不建映射表。
 *
 * 用法: npx tsx scripts/prepare-mapping-input.ts
 */

import { prisma } from "../src/lib/prisma";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "scratchpad");

// RFC4180 CSV 转义: 含逗号/引号/换行时用双引号包, 内部引号翻倍。
function csv(v: string | number): string {
  const str = String(v ?? "");
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(header: string[], rows: (string | number)[][]): string {
  const lines = [header.join(",")];
  for (const r of rows) lines.push(r.map(csv).join(","));
  return lines.join("\n") + "\n";
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // ---------- 1. PcdbSubCategory + belongs_to_categories ----------
  const subs = await prisma.pcdbSubCategory.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });

  // category id -> name
  const cats = await prisma.pcdbCategory.findMany({
    select: { id: true, name: true },
  });
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  // distinct (subCategoryId, categoryId) 对 → subId -> Set<categoryName>
  const pairs = await prisma.pcdbPartCategory.findMany({
    distinct: ["subCategoryId", "categoryId"],
    select: { subCategoryId: true, categoryId: true },
  });
  const catsBySub = new Map<number, Set<string>>();
  for (const p of pairs) {
    const set = catsBySub.get(p.subCategoryId) ?? new Set<string>();
    set.add(catName.get(p.categoryId) ?? String(p.categoryId));
    catsBySub.set(p.subCategoryId, set);
  }

  const subRows = subs.map((s) => {
    const names = [...(catsBySub.get(s.id) ?? [])].sort();
    return [s.id, s.name, names.join(";")];
  });
  const subCsv = toCsv(
    ["sub_category_id", "sub_category_name", "belongs_to_categories"],
    subRows
  );
  const subPath = join(OUT_DIR, "pcdb-subcategories.csv");
  writeFileSync(subPath, subCsv);

  // ---------- 2. eBay leaves (Car & Truck Parts 子树) ----------
  const leaves = await prisma.ebayCategory.findMany({
    where: {
      isLeaf: true,
      fullPath: { contains: "Car & Truck Parts & Accessories" },
    },
    orderBy: { id: "asc" },
    select: { id: true, name: true, fullPath: true },
  });
  const leafRows = leaves.map((l) => [l.id, l.name, l.fullPath]);
  const leafCsv = toCsv(["ebay_id", "ebay_name", "ebay_path"], leafRows);
  const leafPath = join(OUT_DIR, "ebay-leaves.csv");
  writeFileSync(leafPath, leafCsv);

  // ---------- summary ----------
  const multiCat = subRows.filter((r) => String(r[2]).includes(";")).length;
  const noCat = subRows.filter((r) => r[2] === "").length;
  console.log("=== Prepared mapping input ===");
  console.log(`  ${subPath}`);
  console.log(`    ${subRows.length} sub-categories (data rows)`);
  console.log(`      · ${multiCat} belong to multiple categories`);
  console.log(`      · ${noCat} have no category`);
  console.log(`  ${leafPath}`);
  console.log(`    ${leafRows.length} eBay leaf categories (data rows)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
