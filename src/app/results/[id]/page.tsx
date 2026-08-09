/**
 * /results/[id] — user-side (customer) result view for one MatchSearch.
 *
 * Same data as the admin detail page (/search/history/[id]) — reuses the stored
 * OptimizerResult rankings (Budget / Rush / Balanced), no new backend compute.
 * Renders the simplified ≤5 merged view (UserResults) instead of the full table.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { type Candidate, type EnrichedFields } from "@/components/CandidateCard";
import { selectUserResults } from "@/lib/userResults";
import { SourcingProvider } from "@/app/search/SourcingContext";
import QuoteBuilder from "@/app/search/QuoteBuilder";
import UserResults, { type UserHero } from "./UserResults";

export const dynamic = "force-dynamic";

type RawCandidate = {
  item_id?: string;
  compatibility?: Record<string, unknown>;
  optimizer_fields?: EnrichedFields;
  additional_image_urls?: string[];
  part_number_list?: string[];
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const search = await prisma.matchSearch.findUnique({
    where: { id },
    include: { candidates: { orderBy: { rank: "asc" } } },
  });
  if (!search) notFound();

  // 已存的三份排名 (prewarm 都算过) + 用于 pick 徽章的 rank1
  const orRows = await prisma.optimizerResult.findMany({
    where: { matchSearchId: id, preset: { in: ["Budget", "Rush", "Balanced"] } },
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

  // 类目名
  let category: string | null = null;
  if (search.queryPcdbCategoryId != null) {
    const cat = await prisma.pcdbCategory.findUnique({
      where: { id: search.queryPcdbCategoryId },
      select: { name: true },
    });
    category = cat?.name ?? null;
  }

  const context = {
    part: search.queryPartDescription,
    vehicle: `${search.queryVehicleYear} ${search.queryVehicleMake} ${search.queryVehicleModel}${
      search.queryVehicleSubModel ? ` ${search.queryVehicleSubModel}` : ""
    }`,
    category,
  };

  const hasResults = heroes.length > 0;

  const when = search.createdAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // 布局与 admin view 对齐: 快照头 + 左结果 / 右 Quote Builder 两栏
  return (
    <main className="w-full max-w-[1280px] mx-auto p-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/search/history"
          className="text-sm text-gray-500 hover:text-gray-700 transition inline-flex items-center gap-1"
        >
          <ChevronLeft size={15} />
          Back to history
        </Link>
        <Link
          href={`/search/history/${id}`}
          className="text-xs text-gray-400 hover:text-[#00B4A6] transition"
        >
          Admin view →
        </Link>
      </div>

      {/* 搜索快照头 (同 admin) */}
      <div className="mt-4 bg-[#1A1A2E] text-white rounded-xl p-6">
        <div className="text-xs text-white/50 tracking-wide">Searched for</div>
        <div className="mt-1 text-xl font-semibold">
          {search.queryPartDescription}
        </div>
        <div className="mt-1 text-sm text-white/70">
          {context.vehicle}
          {search.queryPartNumber ? ` · PN ${search.queryPartNumber}` : ""}
          {category ? ` · ${category}` : ""}
        </div>
        <div className="mt-2 text-xs text-white/40">{when}</div>
      </div>

      <SourcingProvider>
        <div className="mt-6 flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0 w-full">
            {hasResults ? (
              <UserResults
                context={context}
                heroes={heroes}
                alternates={alternates}
              />
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
                No verified matches for this search. Try adjusting the
                description or part number.
              </div>
            )}
          </div>
          <div className="w-full lg:w-[320px] flex-shrink-0">
            <QuoteBuilder />
          </div>
        </div>
      </SourcingProvider>
    </main>
  );
}
