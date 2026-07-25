"use client";

/**
 * 候选表格视图 (/search 专用)。
 *
 * 7 列: Part/Brand · Condition · Seller · Delivery · Warranty · Price · Score
 * + 展开箭头。点箭头在行下方插一整行 (colspan) 显示 CandidateDetail 详情。
 *
 * 排序: optimizerRank 升序, null (被 gate) 排最后。
 * Rank 1: Award icon + teal 底。被 filter 的: Score 列显示 Filtered pill。
 */

import { Fragment, useState } from "react";
import Image from "next/image";
import { Award, Star, ChevronRight, ChevronDown, Check } from "lucide-react";
import {
  type Candidate,
  CandidateDetail,
  formatDeliveryRange,
  formatWarranty,
  parseSellerPct,
} from "@/components/CandidateCard";
import { useSourcing } from "./SourcingContext";

// preset → pick tag 文案 + 配色 (沿用设计 token: teal=Ready Now, amber=Best Price)
const PICK_TAG: Record<string, { label: string; className: string }> = {
  sameDayJob: { label: "Same-day pick", className: "bg-teal-50 text-teal-700" },
  costFirst: { label: "Best price pick", className: "bg-amber-50 text-amber-700" },
  qualityFirst: { label: "Quality pick", className: "bg-violet-50 text-violet-700" },
  scheduled: { label: "Scheduled pick", className: "bg-slate-100 text-slate-600" },
};

function PickTag({ preset }: { preset: string }) {
  const meta = PICK_TAG[preset] ?? {
    label: `${preset} pick`,
    className: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

// Select 按钮: Add / ✓ Primary / ✓ Alt, 备选满时禁用
function SelectButton({
  candidate,
  siblings,
}: {
  candidate: Candidate;
  siblings: Candidate[];
}) {
  const s = useSourcing();
  const isPrimary = s.primary?.id === candidate.id;
  const isAlt = s.alternatives.some((a) => a.id === candidate.id);
  const selected = isPrimary || isAlt;
  const disabled = !selected && s.primary != null && s.altFull;

  function handleClick() {
    if (selected) {
      s.remove(candidate.id);
    } else if (!s.primary) {
      s.selectAsPrimary(candidate, siblings);
    } else if (!s.altFull) {
      s.selectAsAlternative(candidate);
    }
  }

  const base =
    "inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[13px] font-medium transition whitespace-nowrap";
  let cls: string;
  let content: React.ReactNode;
  if (isPrimary) {
    cls = "bg-[#1A1A2E] text-white";
    content = (
      <>
        <Check size={12} /> Primary
      </>
    );
  } else if (isAlt) {
    cls = "bg-teal-100 text-teal-700";
    content = (
      <>
        <Check size={12} /> Alt
      </>
    );
  } else if (disabled) {
    cls = "bg-gray-200 text-gray-400 cursor-not-allowed";
    content = "Full";
  } else {
    cls = "bg-[#00B4A6] hover:bg-[#00A396] text-white";
    content = "Select";
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? "Alternatives full" : undefined}
      className={`${base} ${cls}`}
    >
      {content}
    </button>
  );
}

export function CandidateTable({ candidates }: { candidates: Candidate[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 排序: 有 optimizerRank 在前 (升序), null 排最后
  const sorted = [...candidates].sort((a, b) => {
    const ar = a.optimizerRank;
    const br = b.optimizerRank;
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1;
    if (br != null) return 1;
    return a.rank - b.rank;
  });

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2 font-medium">Part / Brand</th>
            <th className="px-3 py-2 font-medium">Condition</th>
            <th className="px-3 py-2 font-medium">Seller</th>
            <th className="px-3 py-2 font-medium">Delivery</th>
            <th className="px-3 py-2 font-medium">Warranty</th>
            <th className="px-3 py-2 font-medium text-right">Price</th>
            <th className="px-3 py-2 font-medium text-right">Score</th>
            <th className="px-3 py-2" />
            <th className="px-3 py-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const isOpen = expanded.has(c.id);
            const isTopPick = c.optimizerRank === 1;
            const isGated = c.optimizerGateReason != null;
            const ef = c.enrichedFields || {};
            const sellerPct = parseSellerPct(ef.seller_feedback_pct);
            const sellerCount = ef.seller_feedback_count ?? null;
            const delivery = formatDeliveryRange(
              ef.delivery_min_date,
              ef.delivery_max_date
            );
            const warranty = formatWarranty(ef.warranty_raw);

            return (
              <Fragment key={c.id}>
                {/* pick tag 行: 该候选在某些 preset 下是 Rank 1 时, 上方显示一行标签 */}
                {c.pickInPresets && c.pickInPresets.length > 0 && (
                  <tr className={isTopPick ? "bg-teal-50/50" : ""}>
                    <td colSpan={8} className="px-3 pt-2 pb-0">
                      <div className="flex flex-wrap gap-1.5">
                        {c.pickInPresets.map((p) => (
                          <PickTag key={p} preset={p} />
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                <tr
                  className={`border-b border-gray-100 align-top ${
                    isTopPick ? "bg-teal-50/50" : "hover:bg-gray-50/60"
                  }`}
                >
                  {/* PART / BRAND */}
                  <td className="px-3 py-2 max-w-[300px]">
                    <div className="flex items-center gap-1.5">
                      {isTopPick && (
                        <Award size={12} className="text-[#00B4A6] shrink-0" />
                      )}
                      <span className="text-xs font-medium text-gray-600 truncate">
                        {c.brand ?? "—"}
                      </span>
                    </div>
                    <div className="text-[13px] text-[#1A1A2E] leading-snug line-clamp-2">
                      {c.title}
                    </div>
                  </td>

                  {/* CONDITION */}
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {c.condition ?? "—"}
                  </td>

                  {/* SELLER */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {sellerPct != null ? (
                      <>
                        <div className="text-gray-700">
                          ✓ {sellerPct.toFixed(1)}%
                        </div>
                        {sellerCount != null && (
                          <div className="text-[11px] text-gray-400">
                            {sellerCount.toLocaleString()}
                          </div>
                        )}
                        {ef.top_rated && (
                          <span className="mt-0.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium bg-yellow-50 text-yellow-700">
                            <Star size={9} />
                            Top Rated
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  {/* DELIVERY */}
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {delivery ?? "—"}
                  </td>

                  {/* WARRANTY */}
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {warranty ?? "—"}
                  </td>

                  {/* PRICE */}
                  <td className="px-3 py-2 text-right font-semibold text-[#1A1A2E] whitespace-nowrap">
                    ${c.price}
                  </td>

                  {/* SCORE / Filtered */}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {c.optimizerTotal != null ? (
                      <span className="text-gray-700 tabular-nums">
                        {c.optimizerTotal.toFixed(0)}
                      </span>
                    ) : isGated ? (
                      <span
                        title={c.optimizerGateReason ?? undefined}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700"
                      >
                        Filtered
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  {/* Select (Add / Primary / Alt) */}
                  <td className="px-3 py-2">
                    <SelectButton candidate={c} siblings={sorted} />
                  </td>

                  {/* 展开箭头 */}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      className="text-gray-400 hover:text-[#00B4A6] transition"
                    >
                      {isOpen ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                  </td>
                </tr>

                {isOpen && (
                  <tr className={isTopPick ? "bg-teal-50/30" : "bg-gray-50/60"}>
                    <td colSpan={9} className="px-3 py-3 border-b border-gray-100">
                      <div className="flex gap-3">
                        {c.imageUrl && (
                          <a
                            href={c.itemUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                          >
                            <Image
                              src={c.imageUrl}
                              alt={c.title}
                              width={60}
                              height={60}
                              className="w-[60px] h-[60px] object-cover rounded border border-gray-100"
                            />
                          </a>
                        )}
                        <div className="flex-1 min-w-0 max-h-[320px] overflow-y-auto">
                          <a
                            href={c.itemUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-gray-400 hover:text-[#00B4A6] transition"
                          >
                            View on eBay ↗
                          </a>
                          <div className="mt-2">
                            <CandidateDetail candidate={c} />
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
