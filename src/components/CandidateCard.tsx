"use client";

/**
 * 候选卡片 — 从 SearchClient.tsx 抽出来共享。
 *
 * 两个页面复用:
 *   - RO PartLine 搜索页 (SearchClient)
 *   - 独立车辆搜索页 (VehicleSearchClient)
 *
 * 卡片布局约定 (等高 / 三段 / 浮层展开) 见各 className 注释。
 */

import { useState } from "react";
import {
  Check, ExternalLink, Award, ChevronDown, ChevronUp,
  Truck, Star, Shield, RotateCcw, Package,
} from "lucide-react";
import Image from "next/image";

// ============================================================
// Types (前端候选形状 —— matcher 响应 shape 后的结果)
// ============================================================

export type EnrichedFields = {
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

export type Candidate = {
  id: string;
  rank: number;
  title: string;
  price: string;
  currency: string;
  itemUrl: string;
  imageUrl: string | null;
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
  additionalImageUrls: string[];
  // 该候选在哪些 preset 下是 Rank 1 (从 OptimizerResult 表算)。用于 pick tag。
  pickInPresets?: string[];
};

// ============================================================
// Helpers
// ============================================================

function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

export function formatDeliveryRange(min: string | null | undefined, max: string | null | undefined): string | null {
  const mn = daysFromNow(min);
  const mx = daysFromNow(max);
  if (mn == null && mx == null) return null;
  if (mn != null && mx != null) {
    if (mn === mx) return `${mn}d`;
    return `${mn}–${mx}d`;
  }
  return `~${mn ?? mx}d`;
}

export function formatWarranty(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/lifetime/i.test(v)) return "Lifetime";
  return v;
}

// seller_feedback_pct 可能是 number 或 string, 统一成 number|null
export function parseSellerPct(
  v: string | number | null | undefined
): number | null {
  if (typeof v === "number") return v;
  if (v) return Number(v);
  return null;
}

// ============================================================
// Card
// ============================================================

export function CandidateCard({ candidate }: { candidate: Candidate }) {
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
  const delivery = formatDeliveryRange(ef.delivery_min_date, ef.delivery_max_date);
  const warranty = formatWarranty(ef.warranty_raw);
  const country = ef.country ?? null;

  return (
    <div
      className={`relative h-full min-h-[180px] flex flex-col bg-white border rounded-lg transition ${
        isTopPick
          ? "border-teal-400 shadow-md ring-1 ring-teal-100"
          : isVerifiedMatch
          ? "border-teal-200 shadow-sm"
          : "border-gray-200"
      }`}
    >
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex-1 flex items-stretch justify-between gap-4">
          {candidate.imageUrl && (
            <a
              href={candidate.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              /* self-stretch + flex: 让 <a> 撑满行高,内部 img 的 h-full 才有参照 */
              className="flex-shrink-0 self-stretch flex"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={candidate.imageUrl}
                alt={candidate.title}
                width={200}
                height={200}
                className="w-[150px] h-full object-cover rounded border border-gray-100"
              />
            </a>
          )}

          <div className="min-w-0 flex-1 flex flex-col">
            {/* 上: fitment / rank 徽章,置顶 */}
            <div className="flex items-center gap-2 flex-wrap">
               {/* 1. Fitment 标签: Verified / Uncertain / Rejected */}
  {isVerifiedMatch && (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700">
      <Check size={10} />
      Verified
    </span>
  )}
  {candidate.candidateLabel === 0 && (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
      Rejected
    </span>
  )}
  {candidate.candidateLabel === null && (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
      Uncertain
    </span>
  )}
              {/* 2. Verified 后接 Rank badge */}
  {isVerifiedMatch && isRanked && (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1A1A2E] text-white">
      {isTopPick && <Award size={10} />}
      Rank {candidate.optimizerRank}
    </span>
  )}
  {isRanked && candidate.optimizerTotal != null && (
    <span
      className="text-[10px] text-gray-400"
      title={`price: ${candidate.optimizerPriceScore?.toFixed(0)} | quality: ${candidate.optimizerQualityScore?.toFixed(0)}`}
    >
      Score {candidate.optimizerTotal.toFixed(0)}
    </span>
  )}

  {/* 4. Verified 后接 Filter reason (被 gate 拒的情况) */}
  {isVerifiedMatch && isGated && (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">
      Filter reason: {candidate.optimizerGateReason}
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

            {/* 中: 品牌 / 标题 / 属性,flex-1 吃满剩余高度并垂直居中 */}
            <div className="flex-1 flex flex-col justify-center">
            {candidate.brand && (
              <div className="mt-1 text-xs font-medium text-gray-600">
                {candidate.brand}
              </div>
            )}
            <div className="mt-0.5 text-sm text-[#1A1A2E] leading-snug">
              {candidate.title}
            </div>

            <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-gray-500">
            {candidate.condition && (
    <span>{candidate.condition}</span>
  )}
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
                <span className="inline-flex items-center gap-0.5" title="Warranty">
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
            </div>

            {/* 下: View on eBay / Score / More,置底 */}
            <div className="mt-2 flex items-center gap-3">
              <a
                href={candidate.itemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-[#00B4A6] transition"
              >
                View on eBay <ExternalLink size={10} />
              </a>
            </div>
          </div>

          {/* 右列: 价格置顶, More 置底 —— 与价格同一条右边线对齐 */}
          <div className="flex-shrink-0 flex flex-col items-end justify-between text-right">
            <div>
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
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-[#00B4A6] transition"
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
      </div>

      {/*
        展开面板做成浮层 (absolute + top-full),不占据卡片高度。
        否则 grid 的 items-stretch 会把同一行其他卡片一起拉高,
        看起来像"所有卡片都展开了"。
      */}
      {expanded && (
        <div className="absolute left-0 right-0 top-full z-20 -mt-px rounded-b-lg border border-gray-200 bg-gray-50 shadow-lg px-4 py-3 max-h-[320px] overflow-y-auto">
          <CandidateDetail candidate={candidate} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// CandidateDetail —— 候选展开详情 (compatibility / seller / returns / photos)
// 抽出来共享: CandidateCard 的浮层展开区 + /search 表格的展开行都用它。
// 自包含 (从 candidate 自己算 ef / sellerPct / sellerCount)。
// ============================================================

export function CandidateDetail({ candidate }: { candidate: Candidate }) {
  const ef = candidate.enrichedFields || {};
  const sellerPct = parseSellerPct(ef.seller_feedback_pct);
  const sellerCount = ef.seller_feedback_count ?? null;

  return (
    <div className="text-xs text-gray-600 space-y-2">
      {candidate.compatibility && Object.keys(candidate.compatibility).length > 0 && (
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

      {ef.seller_username && (
        <div>
          <div className="font-medium text-gray-500 uppercase tracking-wide text-[10px] mb-1">
            Seller
          </div>
          <div>
            {ef.seller_username}
            {sellerPct != null && ` · ${sellerPct.toFixed(1)}% positive`}
            {sellerCount != null && ` (${sellerCount.toLocaleString()} feedback)`}
          </div>
        </div>
      )}

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
          <div className="flex flex-wrap gap-1.5">
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
    </div>
  );
}
