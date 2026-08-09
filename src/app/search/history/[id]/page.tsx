/**
 * /search/history/[id] — 单次搜索的复盘详情 (只读, 从库里读, 不重打 eBay)。
 *
 * 复用 /search 的 CandidateTable。排序视角固定为 Balanced
 * (与历史列表的 Top pick 一致): 候选的 optimizer* 用 Balanced 的
 * OptimizerResult 覆盖, pickInPresets 照常从四个 preset 算。
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { type Candidate, type EnrichedFields } from "@/components/CandidateCard";
import { CandidateTable } from "../../CandidateTable";
import { computePickInPresets } from "@/lib/prewarm-presets";
import { requireLivePlatformAdmin } from "@/lib/auth/liveSession";

export const dynamic = "force-dynamic";

const HISTORY_PRESET = "Balanced";

type RawCandidate = {
  item_id?: string;
  compatibility?: Record<string, unknown>;
  optimizer_fields?: EnrichedFields;
  additional_image_urls?: string[];
  part_number_list?: string[];
};

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 权威会话:登录后被停用/降级的账号立刻失效,不等 token 过期
  // Admin view: 内部表格,页面这一层再挡一次 (proxy 已经拦过一道)
  await requireLivePlatformAdmin();

  const { id } = await params;

  const search = await prisma.matchSearch.findUnique({
    where: { id },
    include: { candidates: { orderBy: { rank: "asc" } } },
  });
  if (!search) notFound();

  // Balanced 的 optimizer 结果 (覆盖 Candidate 表里的 optimizer* —— 那是"最后
  // 一次切的 preset", 未必是 Balanced)。
  const balanced = await prisma.optimizerResult.findMany({
    where: { matchSearchId: id, preset: HISTORY_PRESET },
    select: {
      candidateId: true,
      rank: true,
      total: true,
      priceScore: true,
      speedScore: true,
      qualityScore: true,
      gateReason: true,
    },
  });
  const balByCand = new Map(balanced.map((b) => [b.candidateId, b]));

  // 每个候选在哪些 preset 下是 rank1 → pick 徽章
  const pickMap = await computePickInPresets(id);

  // rawResponse 里按 item_id 建 lookup, 拿 enrichedFields / brand / compat / 附加图
  const rawByItemId = new Map<string, RawCandidate>();
  if (search.rawResponse) {
    const raw = search.rawResponse as { candidate_info_list?: RawCandidate[] };
    for (const c of raw.candidate_info_list ?? []) {
      if (c.item_id) rawByItemId.set(c.item_id, c);
    }
  }

  const candidates: Candidate[] = search.candidates.map((c) => {
    const raw = rawByItemId.get(c.ebayItemId);
    const compat = raw?.compatibility || {};
    const brand =
      (compat.Brand as string) || (compat.Make as string) || null;
    const b = balByCand.get(c.id);
    return {
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
      // Balanced 有值就用 Balanced, 否则回落到 Candidate 表存的
      optimizerRank: b?.rank ?? c.optimizerRank,
      optimizerTotal: b?.total ?? c.optimizerTotal,
      optimizerPriceScore: b?.priceScore ?? c.optimizerPriceScore,
      optimizerSpeedScore: b?.speedScore ?? c.optimizerSpeedScore,
      optimizerQualityScore: b?.qualityScore ?? c.optimizerQualityScore,
      optimizerGateReason: b?.gateReason ?? c.optimizerGateReason,
      brand,
      enrichedFields: raw?.optimizer_fields ?? null,
      compatibility: (raw?.compatibility as Record<string, unknown>) ?? null,
      additionalImageUrls: raw?.additional_image_urls ?? [],
      partNumbers: raw?.part_number_list ?? [],
      pickInPresets: pickMap.get(c.id) ?? [],
    };
  });

  const verified = candidates.filter((c) => c.candidateLabel === 1);
  const others = candidates.filter((c) => c.candidateLabel !== 1);

  const when = search.createdAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

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
        <div className="shrink-0 flex items-center gap-3">
          <Link
            href={`/results/${id}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A1A2E] text-white text-sm font-medium hover:bg-[#2a2a44] transition"
          >
            Customer view →
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00A396] transition"
          >
            <Plus size={14} />
            Search
          </Link>
        </div>
      </div>

      {/* 搜索快照头 */}
      <div className="mt-4 bg-[#1A1A2E] text-white rounded-xl p-6">
        <div className="text-xs text-white/50 tracking-wide">Searched for</div>
        <div className="mt-1 text-xl font-semibold">
          {search.queryPartDescription}
        </div>
        <div className="mt-1 text-sm text-white/70">
          {search.queryVehicleYear} {search.queryVehicleMake}{" "}
          {search.queryVehicleModel}
          {search.queryVehicleSubModel ? ` ${search.queryVehicleSubModel}` : ""}
          {search.queryPartNumber ? ` · PN ${search.queryPartNumber}` : ""}
        </div>
        <div className="mt-2 text-xs text-white/40">{when}</div>
      </div>

      {/* 表格全宽 —— 报价侧栏已移除 */}
      <div className="mt-6">
        <div className="mb-3 text-sm font-medium text-gray-500 uppercase tracking-wide">
          Verified candidates ({verified.length})
        </div>
        {verified.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
            No verified matches in this search.
          </div>
        ) : (
          <CandidateTable candidates={verified} currentPreset={HISTORY_PRESET} />
        )}

        {others.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-xs uppercase tracking-wide font-medium text-gray-500">
              Other candidates ({others.length})
              <span className="text-gray-400 ml-1 normal-case tracking-normal font-normal">
                (uncertain / rejected)
              </span>
            </div>
            <CandidateTable candidates={others} currentPreset={HISTORY_PRESET} />
          </div>
        )}
      </div>
    </main>
  );
}
