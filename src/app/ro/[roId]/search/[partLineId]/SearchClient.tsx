"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Loader2,
  Search,
  Pencil,
  X,
  Check,
  ExternalLink,
  Award,
  ChevronDown,
  ChevronUp,
  Truck,
  Star,
  Shield,
  RotateCcw,
  Package,
} from "lucide-react";

type EnrichedFields = {
  seller_username?: string | null;
  seller_feedback_pct?: string | number | null;
  seller_feedback_count?: number | null;
  top_rated?: boolean | null;
  availability_status?: string | null;
  available_qty?: number | null;
  sold_qty?: number | null;
  shipping_cost?: string | number | null;
  delivery_min_date?: string | null;
  delivery_max_date?: string | null;
  returns_accepted?: boolean | null;
  return_period_days?: number | null;
  warranty_raw?: string | null;
  country?: string | null;
};

type Candidate = {
  id: string;
  rank: number;
  title: string;
  price: string;
  currency: string;
  itemUrl: string;
  condition: string | null;
  candidateLabel: number | null;
  labelSource: string | null;
  ebayItemId: string;
  optimizerRank: number | null;
  optimizerTotal: number | null;
  optimizerPriceScore: number | null;
  optimizerQualityScore: number | null;
  optimizerGateReason: string | null;
  brand: string | null;
  enrichedFields: EnrichedFields | null;
  compatibility: Record<string, unknown> | null;
  imageUrl: string | null;
  additionalImageUrls: string[];
};

type SearchResult = {
  id: string;
  createdAt: string;
  label: number | null;
  labelSource: string | null;
  candidateCount: number;
  candidates: Candidate[];
  optimizerMeta?: {
    preset: string | null;
    eligibleCount: number;
    rejectedCount: number;
  };
};

type Props = {
  partLineId: string;
  initialPartDescription: string;
  initialPartDescriptionRaw: string;
  initialPartNumber: string | null;
  initialPartNumberRaw: string | null;
  partType: string | null;
  cccLineNumber: number;
  historicalPurchase: {
    actualCost: string | null;
    vendorName: string | null;
  } | null;
  latestSearch: SearchResult | null;
};

// ============================================================
// 辅助: 从 delivery ISO 时间戳算到今天的天数
// ============================================================
function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

function formatDeliveryRange(
  min: string | null | undefined,
  max: string | null | undefined,
): string | null {
  const mn = daysFromNow(min);
  const mx = daysFromNow(max);
  if (mn == null && mx == null) return null;
  if (mn != null && mx != null) {
    if (mn === mx) return `${mn}d`;
    return `${mn}–${mx}d`;
  }
  return `~${mn ?? mx}d`;
}

function formatWarranty(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/lifetime/i.test(v)) return "Lifetime";
  return v;
}

// ============================================================
// 主组件
// ============================================================
export default function SearchClient({
  partLineId,
  initialPartDescription,
  initialPartDescriptionRaw,
  initialPartNumber,
  initialPartNumberRaw,
  partType,
  cccLineNumber,
  historicalPurchase,
  latestSearch,
}: Props) {
  const [description, setDescription] = useState(initialPartDescription);
  const [partNumber, setPartNumber] = useState(initialPartNumber ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(latestSearch);
  const [error, setError] = useState<string | null>(null);
  const [showFiltered, setShowFiltered] = useState(false);

  const hasUnsavedEdit =
    description !== initialPartDescription ||
    (partNumber || "") !== (initialPartNumber ?? "");

  async function handleSearch() {
    setError(null);
    setSearching(true);

    try {
      if (hasUnsavedEdit) {
        const patch = await fetch(`/api/part-lines/${partLineId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partDescription: description,
            partNumber: partNumber || null,
          }),
        });
        if (!patch.ok) throw new Error("Failed to save edits");
      }

      const res = await fetch(`/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partLineId, useLlm: false }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Search failed: HTTP ${res.status}`);
      }
      const data = await res.json();

      setResult({
        id: data.matchSearchId,
        createdAt: new Date().toISOString(),
        label: data.label ?? null,
        labelSource: data.labelSource ?? null,
        candidateCount: data.candidateCount ?? 0,
        candidates: data.candidates ?? [],
        optimizerMeta: data.optimizerMeta,
      });
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function cancelEdit() {
    setDescription(initialPartDescription);
    setPartNumber(initialPartNumberRaw ?? "");
    setIsEditing(false);
  }

  // 分组: label=1 是主要展示, 其他 (label=0 / null) 折叠
  const verified =
    result?.candidates.filter((c) => c.candidateLabel === 1) ?? [];
  const others = result?.candidates.filter((c) => c.candidateLabel !== 1) ?? [];

  return (
    <>
      {/* PartLine 编辑面板 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm text-gray-500">
            Line {cccLineNumber} · {partType || "Uncategorized"}
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-gray-500 hover:text-[#00B4A6] transition inline-flex items-center gap-1"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
              Part description
            </label>
            {isEditing ? (
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                placeholder="e.g. Lower grille"
              />
            ) : (
              <>
                <div className="mt-0.5 text-[#1A1A2E]">
                  {description || (
                    <span className="text-gray-400 italic text-sm">
                      (no description)
                    </span>
                  )}
                </div>
                {initialPartDescriptionRaw &&
                  initialPartDescriptionRaw !== description && (
                    <div className="mt-0.5 text-xs text-gray-400 italic">
                      Original: {initialPartDescriptionRaw}
                    </div>
                  )}
              </>
            )}
          </div>

          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
              Part number (optional)
            </label>
            {isEditing ? (
              <input
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                placeholder="OEM number if known"
              />
            ) : (
              <>
                <div className="mt-0.5 text-[#1A1A2E] font-mono text-sm">
                  {partNumber || (
                    <span className="text-gray-400 italic font-sans">
                      (none)
                    </span>
                  )}
                </div>
                {initialPartNumberRaw &&
                  initialPartNumberRaw !== partNumber && (
                    <div className="mt-0.5 text-xs text-gray-400 italic font-mono">
                      Original: {initialPartNumberRaw}
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={handleSearch}
            disabled={searching || !description}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00A396] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {searching ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Searching eBay…
              </>
            ) : (
              <>
                <Search size={14} />
                Search eBay
              </>
            )}
          </button>
          {isEditing && (
            <button
              onClick={cancelEdit}
              disabled={searching}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition disabled:opacity-40"
            >
              <X size={13} />
              Cancel
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* 结果区 */}
      {result && !searching && (
        <div className="mt-6">
          {/* Baseline 横条 (跟历史采购价对比) */}
          {historicalPurchase?.actualCost && (
            <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Baseline: historically paid{" "}
              <span className="font-semibold text-[#1A1A2E]">
                ${historicalPurchase.actualCost}
              </span>
              {historicalPurchase.vendorName && (
                <> at {historicalPurchase.vendorName}</>
              )}
            </div>
          )}

          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Verified candidates ({verified.length})
              {result.optimizerMeta &&
                result.optimizerMeta.eligibleCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400 normal-case tracking-normal">
                    · ranked by {result.optimizerMeta.preset}
                  </span>
                )}
            </h2>
            <span className="text-xs text-gray-400">
              Searched {new Date(result.createdAt).toLocaleString()}
            </span>
          </div>

          {verified.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
              No verified matches. Try adjusting the description or part number.
            </div>
          ) : (
            <div className="space-y-2">
              {verified.map((c) => (
                <CandidateCard key={c.id} candidate={c} />
              ))}
            </div>
          )}

          {/* 折叠区: 其他候选 */}
          {others.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowFiltered(!showFiltered)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-600 hover:bg-gray-100 transition"
              >
                <span>
                  {others.length} additional candidates filtered by matcher
                  <span className="text-gray-400 ml-1">
                    (uncertain / rejected)
                  </span>
                </span>
                {showFiltered ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
              {showFiltered && (
                <div className="mt-2 space-y-2">
                  {others.map((c) => (
                    <CandidateCard key={c.id} candidate={c} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ============================================================
// 候选卡片: 默认收起 seller/shipping/warranty, 点开展开
// ============================================================
function CandidateCard({ candidate }: { candidate: Candidate }) {
  const [expanded, setExpanded] = useState(false);

  const isVerifiedMatch = candidate.candidateLabel === 1;
  const isTopPick = candidate.optimizerRank === 1;
  const isRanked = candidate.optimizerRank != null;
  const isGated = candidate.optimizerGateReason != null;

  const ef = candidate.enrichedFields || {};
  const sellerPct =
    typeof ef.seller_feedback_pct === "number"
      ? ef.seller_feedback_pct
      : ef.seller_feedback_pct
        ? Number(ef.seller_feedback_pct)
        : null;
  const sellerCount = ef.seller_feedback_count ?? null;
  const delivery = formatDeliveryRange(
    ef.delivery_min_date,
    ef.delivery_max_date,
  );
  const warranty = formatWarranty(ef.warranty_raw);
  const country = ef.country ?? null;

  return (
    <div
      className={`bg-white border rounded-lg transition ${
        isTopPick
          ? "border-teal-400 shadow-md ring-1 ring-teal-100"
          : isVerifiedMatch
            ? "border-teal-200 shadow-sm"
            : "border-gray-200"
      }`}
    >
      {/* 主要信息 */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* 主图缩略图 */}
          {candidate.imageUrl && (
            <a
              href={candidate.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={candidate.imageUrl}
                alt={candidate.title}
                width={80}
                height={80}
                className="w-[60px] h-[60px] object-cover rounded border border-gray-100"
              />
            </a>
          )}
          <div className="min-w-0 flex-1">
            {/* Badge 行 */}
            <div className="flex items-center gap-2 flex-wrap">
              {isRanked ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1A1A2E] text-white">
                  {isTopPick && <Award size={10} />}
                  Rank {candidate.optimizerRank}
                </span>
              ) : (
                <span className="font-mono text-[11px] text-gray-400">
                  #{candidate.rank}
                </span>
              )}
              {isVerifiedMatch && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700">
                  <Check size={10} />
                  Verified
                </span>
              )}
              {candidate.candidateLabel === 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                  Uncertain
                </span>
              )}
              {isGated && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700"
                  title={`Filtered out: ${candidate.optimizerGateReason}`}
                >
                  Filtered
                </span>
              )}
              {candidate.condition && (
                <span className="text-[11px] text-gray-500">
                  {candidate.condition}
                </span>
              )}
              {ef.top_rated && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-50 text-yellow-700"
                  title="eBay Top Rated Seller"
                >
                  <Star size={10} />
                  Top Rated
                </span>
              )}
            </div>

            {/* 品牌 + 标题 */}
            {candidate.brand && (
              <div className="mt-1 text-xs font-medium text-gray-600">
                {candidate.brand}
              </div>
            )}
            <div className="mt-0.5 text-sm text-[#1A1A2E] leading-snug">
              {candidate.title}
            </div>

            {/* 关键信号一行: 卖家 + 交付 + 保修 + 发货地 */}
            <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-gray-500">
              {sellerPct != null && sellerCount != null && (
                <span title={`Seller ${ef.seller_username ?? ""}`}>
                  ✓ {sellerPct.toFixed(1)}% · {sellerCount.toLocaleString()}
                </span>
              )}
              {delivery && (
                <span className="inline-flex items-center gap-0.5">
                  <Truck size={11} />
                  {delivery}
                </span>
              )}
              {warranty && (
                <span
                  className="inline-flex items-center gap-0.5"
                  title="Warranty"
                >
                  <Shield size={11} />
                  {warranty}
                </span>
              )}
              {country && country !== "US" && (
                <span
                  className="inline-flex items-center gap-0.5 text-amber-600"
                  title={`Ships from ${country}`}
                >
                  📦 {country}
                </span>
              )}
            </div>

            {/* View on eBay + Score */}
            <div className="mt-2 flex items-center gap-3">
              <a
                href={candidate.itemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-[#00B4A6] transition"
              >
                View on eBay <ExternalLink size={10} />
              </a>
              {isRanked && candidate.optimizerTotal != null && (
                <span
                  className="text-[10px] text-gray-400"
                  title={`price: ${candidate.optimizerPriceScore?.toFixed(0)} | quality: ${candidate.optimizerQualityScore?.toFixed(0)}`}
                >
                  Score {candidate.optimizerTotal.toFixed(0)}
                </span>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-[#00B4A6] transition ml-auto"
              >
                {expanded ? (
                  <>
                    Less <ChevronUp size={11} />
                  </>
                ) : (
                  <>
                    More <ChevronDown size={11} />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex-shrink-0 text-right">
            <div className="text-lg font-semibold text-[#1A1A2E]">
              ${candidate.price}
            </div>
            <button
              disabled
              title="Ordering coming soon"
              className="mt-1 text-[11px] text-gray-400 hover:text-gray-500 cursor-not-allowed"
            >
              Order (soon)
            </button>
          </div>
        </div>
      </div>

      {/* 展开区 */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600 space-y-2">
          {/* 兼容车型 (compatibility) */}
          {candidate.compatibility &&
            Object.keys(candidate.compatibility).length > 0 && (
              <div>
                <div className="font-medium text-gray-500 uppercase tracking-wide text-[10px] mb-1">
                  Compatibility
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {Object.entries(candidate.compatibility)
                    .filter(([k]) => k !== "categoryPath")
                    .map(([k, v]) => (
                      <div key={k}>
                        <span className="text-gray-400">{k}:</span> {String(v)}
                      </div>
                    ))}
                </div>
              </div>
            )}

          {/* 卖家详情 */}
          {ef.seller_username && (
            <div>
              <div className="font-medium text-gray-500 uppercase tracking-wide text-[10px] mb-1">
                Seller
              </div>
              <div>
                {ef.seller_username}
                {sellerPct != null && ` · ${sellerPct.toFixed(1)}% positive`}
                {sellerCount != null &&
                  ` (${sellerCount.toLocaleString()} feedback)`}
              </div>
            </div>
          )}

          {/* 退货 + 销量 + 库存 */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {ef.returns_accepted != null && (
              <div className="inline-flex items-center gap-1">
                <RotateCcw size={11} />
                Returns:{" "}
                {ef.returns_accepted
                  ? `accepted (${ef.return_period_days ?? "?"}d)`
                  : "not accepted"}
              </div>
            )}
            {ef.sold_qty != null && ef.sold_qty > 0 && (
              <div className="inline-flex items-center gap-1">
                <Package size={11} />
                {ef.sold_qty.toLocaleString()} sold
              </div>
            )}
            {ef.available_qty != null && <div>Stock: {ef.available_qty}</div>}
            {ef.shipping_cost != null && Number(ef.shipping_cost) > 0 && (
              <div>Shipping: ${Number(ef.shipping_cost).toFixed(2)}</div>
            )}
          </div>

          {candidate.additionalImageUrls.length > 0 && (
            <div>
              <div className="font-medium text-gray-500 uppercase tracking-wide text-[10px] mb-1">
                More photos
              </div>
              <div className="flex gap-1.5">
                {candidate.additionalImageUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Image
                      src={url}
                      alt={`${candidate.title} ${i + 2}`}
                      width={80}
                      height={80}
                      className="w-[80px] h-[80px] object-cover rounded border border-gray-100"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 若被 gate 拒, 显示原因 */}
          {isGated && (
            <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Filter reason: {candidate.optimizerGateReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
