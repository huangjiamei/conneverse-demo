/**
 * 从 matcher 的 GET /api/taxonomy 拉 eBay Motors > Parts & Accessories 子树,
 * 灌进 Postgres 的 EbayCategory 表。
 *
 * 一次性离线动作: eBay 分类树版本很少变, 变了重跑一次即可 (幂等, 先 deleteMany)。
 *
 * 前提:
 *   1. matcher 本地跑着 (Railway 上那份不用等, 这个 endpoint 只离线用):
 *        uvicorn end_to_end_part_matcher.service:app --port 8001
 *   2. Prisma schema 已 migrate (EbayCategory 表已建好)
 *
 * 期望条数: 2001 (tree 100 / v83, 2026-07)
 *
 * 用法:
 *   npx tsx scripts/import-ebay-taxonomy.ts
 *   (可选: MATCHER_URL 覆盖默认 http://127.0.0.1:8001;
 *          ROOT_CATEGORY_ID 覆盖默认 6028)
 */

import { prisma } from "../src/lib/prisma";

const MATCHER_URL = process.env.MATCHER_URL ?? "http://127.0.0.1:8001";
const ROOT_CATEGORY_ID = process.env.ROOT_CATEGORY_ID ?? "6028";

const CHUNK = 1000;

type TaxonomyCategory = {
  id: number;
  name: string;
  parent_id: number | null;
  level: number;
  is_leaf: boolean;
  full_path: string;
};

type TaxonomyResponse = {
  categories: TaxonomyCategory[];
  total: number;
  category_tree_id?: string;
  category_tree_version?: string | null;
  fetched_at?: string;
};

async function main() {
  const url = `${MATCHER_URL}/api/taxonomy?root_category_id=${ROOT_CATEGORY_ID}`;
  console.log(`[matcher] GET ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`matcher returned ${res.status}: ${detail.slice(0, 500)}`);
  }
  const payload = (await res.json()) as TaxonomyResponse;
  const categories = payload.categories ?? [];
  if (categories.length === 0) {
    throw new Error("matcher returned 0 categories — refusing to wipe the table");
  }
  console.log(
    `  ${payload.total} categories | tree ${payload.category_tree_id} v${payload.category_tree_version} | fetched ${payload.fetched_at}`
  );

  // 拉取的 root (6028) 的 parent 是 6000, 它在子树外 → FK 会挂, 置 null。
  const presentIds = new Set(categories.map((c) => c.id));
  const rows = categories.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parent_id !== null && presentIds.has(c.parent_id) ? c.parent_id : null,
    level: c.level,
    fullPath: c.full_path,
    isLeaf: c.is_leaf,
  }));
  const detached = rows.filter((r) => r.parentId === null).length;
  console.log(`  ${detached} row(s) with parentId=null (root / parent outside subtree)`);

  try {
    console.log("[postgres] clearing existing EbayCategory data...");
    await prisma.ebayCategory.deleteMany();

    // parentId 是自引用 FK 且非 deferrable → 必须先父后子, 按 level 升序分层灌。
    const byLevel = new Map<number, typeof rows>();
    for (const row of rows) {
      const bucket = byLevel.get(row.level);
      if (bucket) bucket.push(row);
      else byLevel.set(row.level, [row]);
    }

    console.log("[import] EbayCategory (level by level)...");
    for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
      const levelRows = byLevel.get(level)!;
      for (let i = 0; i < levelRows.length; i += CHUNK) {
        await prisma.ebayCategory.createMany({ data: levelRows.slice(i, i + CHUNK) });
      }
      console.log(`  level ${level}: ${levelRows.length}`);
    }

    // ---------- 汇总 ----------
    const [count, leafCount, root] = await Promise.all([
      prisma.ebayCategory.count(),
      prisma.ebayCategory.count({ where: { isLeaf: true } }),
      prisma.ebayCategory.findUnique({ where: { id: Number(ROOT_CATEGORY_ID) } }),
    ]);
    console.log("\n=== Import summary ===");
    console.log(`  EbayCategory: ${count}   (matcher sent ${categories.length})`);
    console.log(`  leaf:         ${leafCount}`);
    console.log(`  root:         ${root?.id} ${root?.name} — "${root?.fullPath}"`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
