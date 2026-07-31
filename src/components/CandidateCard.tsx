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
  Truck, Star, Shield, RotateCcw, Package, Boxes,
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
  optimizerSpeedScore: number | null;
  optimizerQualityScore: number | null;
  optimizerGateReason: string | null;
  brand: string | null;
  enrichedFields: EnrichedFields | null;
  compatibility: Record<string, unknown> | null;
  additionalImageUrls: string[];
  // 从 eBay localizedAspects 抽的零件号 (MPN/OE/Interchange 混合的扁平列表,
  // matcher 的 part_number_list —— 类型已在抽取时合并, 不分 MPN/OE/Interchange)。
  partNumbers?: string[];
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

/**
 * 把 optimizer 的机器可读 gate 原因 (category:detail) 翻成人话。
 * 供 Filtered 徽章 tooltip 用。未知 code 原样兜底, 不吞。
 *
 * 原因格式来自 matcher gates.py:
 *   condition:for_parts / condition:not_new:<id> / condition:used:<id>
 *   stock:<status> · seller_feedback:<pct>% · seller_count:<n>
 *   delivery:<a>d><b>d · country:<code> · fitment_risk:<pct>%
 */
export function humanizeGateReason(
  reason: string | null | undefined
): string | null {
  if (!reason) return null;
  const idx = reason.indexOf(":");
  const cat = idx === -1 ? reason : reason.slice(0, idx);
  const detail = idx === -1 ? "" : reason.slice(idx + 1);

  switch (cat) {
    case "condition":
      if (detail === "for_parts")
        return "For-parts / not-working item — excluded";
      if (detail.startsWith("not_new"))
        return "Not a new part (this job status requires new)";
      if (detail.startsWith("used"))
        return "Used item (this job status requires new)";
      return "Condition not eligible";
    case "stock":
      return `Not in stock (${detail.replace(/_/g, " ") || "unavailable"})`;
    case "seller_feedback":
      return `Seller rating ${detail} is below the 98% minimum`;
    case "seller_count":
      return `Seller has only ${detail} ratings (below the 100 minimum)`;
    case "delivery": {
      const m = detail.match(/(\d+)d>(\d+)d/);
      return m
        ? `Delivery ${m[1]} days exceeds the ${m[2]}-day cutoff`
        : "Delivery too slow for this job status";
    }
    case "country":
      return `Ships from ${detail} (US-only required)`;
    case "fitment_risk":
      return `High fitment-complaint rate (${detail})`;
    default:
      return reason; // 未知 code: 原样显示, 便于排查
  }
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
      title={`price: ${candidate.optimizerPriceScore?.toFixed(0) ?? "—"} | speed: ${candidate.optimizerSpeedScore?.toFixed(0) ?? "—"} | quality: ${candidate.optimizerQualityScore?.toFixed(0) ?? "—"}`}
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
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500"
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

// 展开卡片的信息区块: 统一大写灰标签 + 细分隔线 (第一块不画线)。
function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-gray-200 pt-2.5 first:border-t-0 first:pt-0">
      <div className="font-medium text-gray-400 uppercase tracking-wide text-[10px] mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

export function CandidateDetail({ candidate }: { candidate: Candidate }) {
  const ef = candidate.enrichedFields || {};
  const sellerPct = parseSellerPct(ef.seller_feedback_pct);
  const sellerCount = ef.seller_feedback_count ?? null;

  const compatEntries = candidate.compatibility
    ? Object.entries(candidate.compatibility).filter(([k]) => k !== "categoryPath")
    : [];
  const partNumbers = candidate.partNumbers ?? [];

  // 画廊: 主图 + 附加图 全塞进一个数组 (去重, 去空)。缩略图条即画廊。
  const images = Array.from(
    new Set(
      [candidate.imageUrl, ...(candidate.additionalImageUrls ?? [])].filter(
        (u): u is string => !!u
      )
    )
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const heroSrc = images[activeIdx] ?? images[0] ?? null;

  const returnsText =
    ef.returns_accepted != null
      ? ef.returns_accepted
        ? `Returns accepted (${ef.return_period_days ?? "?"}d)`
        : "Returns not accepted"
      : null;
  const soldText =
    ef.sold_qty != null && ef.sold_qty > 0
      ? `${ef.sold_qty.toLocaleString()} sold`
      : null;

  // 库存状态: OUT_OF_STOCK → Backorder; ≤3 件 → "Only N left" (琥珀提示);
  // 充足 / 状态缺失 → 一律 "In stock"。
  const stockQty = ef.available_qty;
  const isBackorder =
    (ef.availability_status ?? "").toUpperCase() === "OUT_OF_STOCK";
  const isLowStock =
    !isBackorder && stockQty != null && stockQty > 0 && stockQty <= 3;

  return (
    <div className="flex flex-col lg:flex-row gap-5 text-xs text-gray-600">
      {/* LEFT: 可切换画廊 —— hero(240) + 缩略图条。点缩略图只换 hero, 不跳转 */}
      {heroSrc && (
        <div className="shrink-0 w-[240px]">
          {/* hero: 把所有图叠着渲染 (提前 preload), 用 opacity 切换 → 即时无闪 */}
          <div className="relative w-[240px] h-[240px]">
            {images.map((url, i) => (
              <Image
                key={url}
                src={url}
                alt={`${candidate.title}${i === 0 ? "" : ` ${i + 1}`}`}
                fill
                sizes="240px"
                priority={i === 0}
                className={`object-cover rounded-lg border border-gray-200 transition-opacity duration-150 ${
                  i === activeIdx ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              />
            ))}
          </div>

          {/* 缩略图条 = 画廊导航 (含主图), 选中态 teal 高亮 */}
          {images.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {images.map((url, i) => (
                <button
                  type="button"
                  key={url}
                  onClick={() => setActiveIdx(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-pressed={i === activeIdx}
                  className={`block rounded overflow-hidden border transition ${
                    i === activeIdx
                      ? "border-[#00B4A6] ring-1 ring-[#00B4A6]"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Image
                    src={url}
                    alt=""
                    width={44}
                    height={44}
                    className="w-[44px] h-[44px] object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RIGHT: 信息分区块 */}
      <div className="flex-1 min-w-0 space-y-2.5">
        {/* 第一部分: 商品标题 (同折叠行) + View on eBay */}
        <div className="flex items-start justify-between gap-3">
          <div className="text-[13px] font-medium text-[#1A1A2E] leading-snug">
            {candidate.title}
          </div>
          <a
            href={candidate.itemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-[#00B4A6] transition whitespace-nowrap"
          >
            View on eBay <ExternalLink size={10} />
          </a>
        </div>

        {compatEntries.length > 0 && (
          <DetailBlock label="Compatibility">
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {compatEntries.map(([k, v]) => (
                <div key={k}>
                  <span className="text-gray-400">{k}:</span> {String(v)}
                </div>
              ))}
            </div>
          </DetailBlock>
        )}

        {partNumbers.length > 0 && (
          <DetailBlock label="Part numbers">
            <div className="flex flex-wrap gap-1">
              {partNumbers.slice(0, 12).map((pn) => (
                <span
                  key={pn}
                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px] font-mono"
                >
                  {pn}
                </span>
              ))}
              {partNumbers.length > 12 && (
                <span className="inline-flex items-center px-1 py-0.5 text-[11px] text-gray-400">
                  +{partNumbers.length - 12} more
                </span>
              )}
            </div>
          </DetailBlock>
        )}

        <DetailBlock label="Seller">
          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-medium">
              eBay store
            </span>
            {ef.seller_username ? (
              <span className="text-gray-700">{ef.seller_username}</span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
            {sellerPct != null && (
              <span className="text-gray-500">· {sellerPct.toFixed(1)}% positive</span>
            )}
            {sellerCount != null && (
              <span className="text-gray-400">
                ({sellerCount.toLocaleString()} feedback)
              </span>
            )}
            {ef.top_rated && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                <Star size={9} />
                Top Rated
              </span>
            )}
          </div>
        </DetailBlock>

        <DetailBlock label="Purchase">
          {/* 库存 + Returns + sold 并成一行 (含 shipping) */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {/* 库存: Backorder / In stock · N available (N≤3 数字染琥珀) /
                available_qty 缺失时只显 In stock */}
            {isBackorder ? (
              <span className="inline-flex items-center gap-1 text-gray-500">
                <Boxes size={11} />
                Backorder
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Boxes size={11} />
                <span>
                  In stock
                  {stockQty != null && stockQty > 0 && (
                    <>
                      {" · "}
                      <span
                        className={isLowStock ? "text-amber-700 font-semibold" : ""}
                      >
                        {stockQty}
                      </span>
                      {" available"}
                    </>
                  )}
                </span>
              </span>
            )}
            {returnsText && (
              <span className="inline-flex items-center gap-1">
                <RotateCcw size={11} />
                {returnsText}
              </span>
            )}
            {soldText && (
              <span className="inline-flex items-center gap-1">
                <Package size={11} />
                {soldText}
              </span>
            )}
            {ef.shipping_cost != null && Number(ef.shipping_cost) > 0 && (
              <span>Shipping: ${Number(ef.shipping_cost).toFixed(2)}</span>
            )}
          </div>
        </DetailBlock>
      </div>
    </div>
  );
}
