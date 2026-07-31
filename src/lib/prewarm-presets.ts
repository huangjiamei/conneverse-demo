/**
 * 预跑其余 preset —— 搜索落库后, 把当前 preset 之外的 3 个 preset 也各调一次
 * matcher /api/rerank, 结果写进 OptimizerResult 表。这样用户切 preset 时
 * switch-preset 永远命中缓存, 不用现场重跑 matcher。
 *
 * 目标: 每次搜索后 OptimizerResult 表里有 4 × N 条 (N = 候选数)。
 *
 * best-effort: 单个 preset 的 rerank 失败不抛错, 只是那个 preset 没预热
 * (切过去时 switch-preset 会自己 cache-miss 补上)。
 */

import { prisma } from "@/lib/prisma";

const MATCHER_URL = process.env.MATCHER_URL ?? "http://127.0.0.1:8001";

// V2 四个 preset (与前端 Job Status / matcher presets.py 对齐)。
// prewarm 只跑这 4 个 → pick 徽章只出 V2 名, 不再冒旧名重复徽章。
export const ALL_PRESETS = [
  "Rush",
  "Balanced",
  "Budget",
  "Premium",
] as const;

type RawCandidate = {
  item_id?: string;
  title?: string;
  condition?: string;
  price?: { value?: string; currency?: string } | null;
  compatibility?: Record<string, unknown>;
  candidate_label?: number | null;
  optimizer_fields?: Record<string, unknown> | null;
};

type RerankResult = {
  optimizer_result?: {
    eligible?: Array<{
      item_id: string;
      rank: number;
      total: number;
      price_score: number;
      speed_score: number;
      quality_score: number;
    }>;
    rejected?: Array<{ item_id: string; reason: string }>;
  };
};

/**
 * @param matchSearchId  本次搜索的 MatchSearch id
 * @param candidates     已落库的候选 (要 id + ebayItemId 做映射)
 * @param rawList        matcher 原始 candidate_info_list (rerank 的输入)
 * @param currentPreset  已经写过的 preset, 跳过它
 */
export async function prewarmOtherPresets(opts: {
  matchSearchId: string;
  candidates: { id: string; ebayItemId: string }[];
  rawList: RawCandidate[];
  currentPreset: string;
}): Promise<void> {
  const { matchSearchId, candidates, rawList, currentPreset } = opts;

  const others = ALL_PRESETS.filter((p) => p !== currentPreset);

  // rerank 请求体对每个 preset 都一样, 只有 preset 字段变
  const rerankCandidates = rawList.map((c) => ({
    item_id: c.item_id ?? "",
    title: c.title ?? "",
    condition: c.condition ?? "",
    price: c.price ?? null,
    compatibility: c.compatibility ?? {},
    candidate_label: c.candidate_label ?? null,
    optimizer_fields: c.optimizer_fields ?? null,
  }));

  // 3 个 preset 并行跑 (rerank 不打 eBay, 很快)
  await Promise.all(
    others.map(async (preset) => {
      try {
        const res = await fetch(`${MATCHER_URL}/api/rerank`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidates: rerankCandidates, preset }),
        });
        if (!res.ok) return; // best-effort

        const data = (await res.json()) as RerankResult;
        const opt = data.optimizer_result;
        if (!opt) return;

        // ebayItemId → optimizer 结果
        const byItem = new Map<
          string,
          {
            rank: number | null;
            total: number | null;
            priceScore: number | null;
            speedScore: number | null;
            qualityScore: number | null;
            gateReason: string | null;
          }
        >();
        for (const e of opt.eligible ?? []) {
          byItem.set(e.item_id, {
            rank: e.rank,
            total: e.total,
            priceScore: e.price_score,
            speedScore: e.speed_score,
            qualityScore: e.quality_score,
            gateReason: null,
          });
        }
        for (const r of opt.rejected ?? []) {
          byItem.set(r.item_id, {
            rank: null,
            total: null,
            priceScore: null,
            speedScore: null,
            qualityScore: null,
            gateReason: r.reason,
          });
        }

        const rows = candidates.map((c) => {
          const r = byItem.get(c.ebayItemId) ?? {
            rank: null,
            total: null,
            priceScore: null,
            speedScore: null,
            qualityScore: null,
            gateReason: null,
          };
          return {
            candidateId: c.id,
            matchSearchId,
            preset,
            rank: r.rank,
            total: r.total,
            priceScore: r.priceScore,
            speedScore: r.speedScore,
            qualityScore: r.qualityScore,
            gateReason: r.gateReason,
          };
        });

        await prisma.optimizerResult.createMany({
          data: rows,
          skipDuplicates: true, // @@unique([candidateId, preset])
        });
      } catch {
        // 某个 preset 预热失败不影响其他, 也不影响搜索本身
      }
    })
  );
}

/**
 * 算每个 candidate 在哪些 preset 下是 Rank 1。
 * 必须在 prewarmOtherPresets 之后调 (要 4 个 preset 都写完 OptimizerResult)。
 *
 * 返回: Map<candidateId, preset[]>  (preset 按 ALL_PRESETS 顺序排, 稳定)
 */
export async function computePickInPresets(
  matchSearchId: string
): Promise<Map<string, string[]>> {
  const picks = await prisma.optimizerResult.findMany({
    where: { matchSearchId, rank: 1 },
    select: { candidateId: true, preset: true },
  });

  const map = new Map<string, string[]>();
  for (const p of picks) {
    const arr = map.get(p.candidateId) ?? [];
    arr.push(p.preset);
    map.set(p.candidateId, arr);
  }
  // 按 canonical 顺序排, tag 显示稳定
  const order = (preset: string) => ALL_PRESETS.indexOf(preset as never);
  for (const arr of map.values()) arr.sort((a, b) => order(a) - order(b));

  return map;
}
