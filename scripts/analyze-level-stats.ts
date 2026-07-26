/**
 * MatchSearch.rawResponse.dataset_meta.level_used 分布分析 (只读)。
 *
 * 用法:
 *   DATABASE_URL="<url>" npx tsx scripts/analyze-level-stats.ts [outfile]
 *   (默认 outfile = /tmp/level-stats.json)
 *
 * 从每条 MatchSearch 的 rawResponse jsonb 提取:
 *   - level_used  = dataset_meta.level_used
 *   - hit_count   = candidate_info_list 中 candidate_label = 1 的候选数
 * 按 level_used 聚合 count / avg_hits / zero_hit_ratio, 并统计 label_source 分布。
 * 纯 SELECT, 不写库。
 */

import { Client } from "pg";
import { writeFileSync } from "fs";

const OUT = process.argv[2] ?? "/tmp/level-stats.json";

// 每条 MatchSearch → level_used + hit_count (label=1 的候选数)。
// hit_count 从 rawResponse.candidate_info_list 现算, 严格按 "label=1 候选数" 定义。
const PER_SEARCH_SQL = `
  SELECT
    ms."rawResponse"->'dataset_meta'->>'level_used'          AS level_used,
    ms."rawResponse"->>'label_source'                        AS label_source,
    (
      SELECT count(*)
      FROM jsonb_array_elements(
             COALESCE(ms."rawResponse"->'candidate_info_list', '[]'::jsonb)
           ) e
      WHERE (e->>'candidate_label') = '1'
    )::int                                                    AS hit_count
  FROM "MatchSearch" ms
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const client = new Client({
    connectionString: url,
    // Neon 等托管库要 SSL; 本地 dev 不需要。若 URL 里没写 sslmode, 用 host 猜。
    ssl: /neon\.tech|sslmode=require|amazonaws/.test(url)
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await client.connect();

  const host = new URL(url).host;
  console.error(`Connected to ${host}`);

  const { rows } = await client.query<{
    level_used: string | null;
    label_source: string | null;
    hit_count: number;
  }>(PER_SEARCH_SQL);
  await client.end();

  const total = rows.length;

  // 按 level 聚合
  const byLevelAcc: Record<
    string,
    { count: number; hitsSum: number; zeroHits: number }
  > = {};
  const byLabelSource: Record<string, number> = {};

  for (const r of rows) {
    const level = r.level_used ?? "unknown";
    const acc = (byLevelAcc[level] ??= { count: 0, hitsSum: 0, zeroHits: 0 });
    acc.count += 1;
    acc.hitsSum += r.hit_count;
    if (r.hit_count === 0) acc.zeroHits += 1;

    const ls = r.label_source ?? "null";
    byLabelSource[ls] = (byLabelSource[ls] ?? 0) + 1;
  }

  const round = (n: number, d = 2) => Number(n.toFixed(d));

  const by_level: Record<
    string,
    { count: number; avg_hits: number; zero_hit_ratio: number }
  > = {};
  for (const [level, a] of Object.entries(byLevelAcc).sort(
    (x, y) => y[1].count - x[1].count
  )) {
    by_level[level] = {
      count: a.count,
      avg_hits: round(a.hitsSum / a.count),
      zero_hit_ratio: round(a.zeroHits / a.count),
    };
  }

  // label_source 分布, 按频次降序
  const label_source_distribution = Object.fromEntries(
    Object.entries(byLabelSource).sort((x, y) => y[1] - x[1])
  );

  const out = {
    total_searches: total,
    by_level,
    label_source_distribution,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(`Wrote ${OUT}`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
