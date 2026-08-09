/**
 * Load the customer-facing result set for one MatchSearch.
 *
 * Extracted from /results/[id] so the search page can render the same cards
 * inline right after a search (via GET /api/results/[id]) instead of navigating
 * to a separate route.
 *
 * Reuses the stored OptimizerResult rankings for Budget / Rush / Balanced —
 * no matcher or optimizer work happens here.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Candidate, EnrichedFields } from "@/components/CandidateCard";
import { selectUserResults, type HeroBadge } from "@/lib/userResults";

export type UserHero = { candidate: Candidate; badge: HeroBadge };

export type UserResultsContext = {
  part: string;
  vehicle: string;
  category: string | null;
  partNumber: string | null;
  createdAt: string;
};

export type UserResultsPayload = {
  context: UserResultsContext;
  heroes: UserHero[];
  alternates: Candidate[];
};

type RawCandidate = {
  item_id?: string;
  compatibility?: Record<string, unknown>;
  optimizer_fields?: EnrichedFields;
  additional_image_urls?: string[];
  part_number_list?: string[];
};

const RANKED_PRESETS = ["Budget", "Rush", "Balanced"] as const;

/**
 * @param scope 可见范围片段 (lib/searchScope)。并进 where 里一次查,
 *   不在范围内和不存在一样都返回 null —— 调用方统一当 404, 不泄露"存在但没权限"。
 * @returns null when the search doesn't exist or is out of scope
 */
export async function loadUserResults(
  matchSearchId: string,
  scope: Prisma.MatchSearchWhereInput = {}
): Promise<UserResultsPayload | null> {
  const search = await prisma.matchSearch.findFirst({
    where: { id: matchSearchId, ...scope },
    include: { candidates: { orderBy: { rank: "asc" } } },
  });
  if (!search) return null;

  // 已存的三份排名 (prewarm 都算过) + 用于 pick 徽章的 rank1
  const orRows = await prisma.optimizerResult.findMany({
    where: { matchSearchId, preset: { in: [...RANKED_PRESETS] } },
    select: { candidateId: true, preset: true, rank: true },
  });
  const budgetRank = new Map<string, number | null>();
  const rushRank = new Map<string, number | null>();
  const balRank = new Map<string, number | null>();
  const pickByCand = new Map<string, string[]>();
  for (const r of orRows) {
    const m =
      r.preset === "Budget"
        ? budgetRank
        : r.preset === "Rush"
          ? rushRank
          : r.preset === "Balanced"
            ? balRank
            : null;
    if (m) m.set(r.candidateId, r.rank);
    if (r.rank === 1) {
      const a = pickByCand.get(r.candidateId) ?? [];
      a.push(r.preset);
      pickByCand.set(r.candidateId, a);
    }
  }

  // rawResponse lookup (enrichedFields / brand / compat / part numbers / images)
  const rawByItemId = new Map<string, RawCandidate>();
  if (search.rawResponse) {
    const raw = search.rawResponse as { candidate_info_list?: RawCandidate[] };
    for (const c of raw.candidate_info_list ?? []) {
      if (c.item_id) rawByItemId.set(c.item_id, c);
    }
  }

  const candMap = new Map<string, Candidate>();
  for (const c of search.candidates) {
    const raw = rawByItemId.get(c.ebayItemId);
    const compat = raw?.compatibility || {};
    const brand = (compat.Brand as string) || (compat.Make as string) || null;
    candMap.set(c.id, {
      id: c.id,
      rank: c.rank,
      title: c.title,
      price: String(c.price),
      currency: c.currency,
      itemUrl: c.itemUrl,
      imageUrl: c.imageUrl,
      condition: c.condition,
      candidateLabel: c.candidateLabel,
      labelSource: c.labelSource,
      ebayItemId: c.ebayItemId,
      optimizerRank: c.optimizerRank,
      optimizerTotal: c.optimizerTotal,
      optimizerPriceScore: c.optimizerPriceScore,
      optimizerSpeedScore: c.optimizerSpeedScore,
      optimizerQualityScore: c.optimizerQualityScore,
      optimizerGateReason: c.optimizerGateReason,
      brand,
      enrichedFields: raw?.optimizer_fields ?? null,
      compatibility: (raw?.compatibility as Record<string, unknown>) ?? null,
      additionalImageUrls: raw?.additional_image_urls ?? [],
      partNumbers: raw?.part_number_list ?? [],
      pickInPresets: pickByCand.get(c.id) ?? [],
    });
  }

  const verifiedIds = search.candidates
    .filter((c) => c.candidateLabel === 1)
    .map((c) => c.id);

  const { heroes: heroSel, alternateIds } = selectUserResults({
    verifiedIds,
    budgetRankByCand: budgetRank,
    rushRankByCand: rushRank,
    balancedRankByCand: balRank,
  });

  const heroes: UserHero[] = heroSel
    .map((h) => {
      const candidate = candMap.get(h.id);
      return candidate ? { candidate, badge: h.badge } : null;
    })
    .filter((h): h is UserHero => h != null);
  const alternates = alternateIds
    .map((aid) => candMap.get(aid))
    .filter((c): c is Candidate => c != null);

  let category: string | null = null;
  if (search.queryPcdbCategoryId != null) {
    const cat = await prisma.pcdbCategory.findUnique({
      where: { id: search.queryPcdbCategoryId },
      select: { name: true },
    });
    category = cat?.name ?? null;
  }

  return {
    context: {
      part: search.queryPartDescription,
      vehicle: `${search.queryVehicleYear} ${search.queryVehicleMake} ${search.queryVehicleModel}${
        search.queryVehicleSubModel ? ` ${search.queryVehicleSubModel}` : ""
      }`,
      category,
      partNumber: search.queryPartNumber ?? null,
      createdAt: search.createdAt.toISOString(),
    },
    heroes,
    alternates,
  };
}
