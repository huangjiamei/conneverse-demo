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
import { Award, Star, ChevronRight, ChevronDown, Check } from "lucide-react";
import {
  type Candidate,
  CandidateDetail,
  formatDeliveryRange,
  formatWarranty,
  parseSellerPct,
  humanizeGateReason,
} from "@/components/CandidateCard";
import { useSourcing } from "./SourcingContext";
import {
  PRESET_META,
  PRESET_COLORS,
  NEUTRAL_BADGE,
  PRESET_ORDER,
  ALL_PRESET_COUNT,
} from "./presetMeta";

// 单个 preset 的 Top1 徽章: preset 主题色, 浅底 + 主色文字 (PRESET_COLORS)。
// 视觉权重压过中性灰的 Top Rated 标。
function PickPill({ preset }: { preset: string }) {
  const meta = PRESET_META[preset];
  const color = PRESET_COLORS[preset];
  if (!meta || !color) return null;
  const { Icon } = meta;
  return (
    <span
      title={`Top pick for ${meta.label}`}
      style={{ backgroundColor: color.bg, color: color.text }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
    >
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

/**
 * 行内 PICK 徽章行。
 * - 当前排序 preset 自己的 Top1 不重复显示 (表头已经写了 Ranked by X)。
 * - 四个 preset 全赢 → 合并成单个 "★ Best overall"。
 * - 其余 → 每个其他 preset 一个小图标 (hover 出名字)。
 */
function PickBadges({
  presets,
  currentPreset,
}: {
  presets: string[];
  currentPreset: string;
}) {
  // 无差别碾压: 四个 preset 全是 Top1 → 单个玫红 ★ Best overall (浅底 + 主色文字)
  if (presets.length >= ALL_PRESET_COUNT) {
    const bo = PRESET_COLORS.BestOverall;
    return (
      <span
        title="Top pick across every job status"
        style={{ backgroundColor: bo.bg, color: bo.text }}
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      >
        <Star size={11} style={{ fill: bo.text, color: bo.text }} />
        Best overall
      </span>
    );
  }

  // 只显示「其他」preset 的 Top1, 去掉当前排序视角, 按 canonical 顺序
  const others = presets
    .filter((p) => p !== currentPreset)
    .sort((a, b) => PRESET_ORDER.indexOf(a) - PRESET_ORDER.indexOf(b));

  if (others.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide mr-0.5">
        Also top for
      </span>
      {others.map((p) => (
        <PickPill key={p} preset={p} />
      ))}
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

export function CandidateTable({
  candidates,
  currentPreset,
}: {
  candidates: Candidate[];
  currentPreset: string;
}) {
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
    <div className="border border-gray-200 rounded-lg">
      <table className="w-full text-sm border-collapse table-fixed">
        {/* 固定列宽: 总和 100%, 长文本列 (标题/warranty) 靠截断/换行, 不撑宽表格 */}
        <colgroup>
          <col className="w-[22%]" /> {/* Part / Brand */}
          <col className="w-[9%]" /> {/* Condition */}
          <col className="w-[12%]" /> {/* Seller */}
          <col className="w-[11%]" /> {/* Delivery */}
          <col className="w-[11%]" /> {/* Warranty */}
          <col className="w-[12%]" /> {/* Price (+ 运费副行, 需要更宽) */}
          <col className="w-[8%]" /> {/* Score */}
          <col className="w-[11%]" /> {/* Select */}
          <col className="w-[36px]" /> {/* 展开箭头 */}
        </colgroup>
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
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const isOpen = expanded.has(c.id);
            const isTopPick = c.optimizerRank === 1;
            // 徽章行是否有内容: 全赢, 或去掉当前 preset 后仍有其他 preset
            const picks = c.pickInPresets ?? [];
            const showPickRow =
              picks.length >= ALL_PRESET_COUNT ||
              picks.some((p) => p !== currentPreset);
            const isGated = c.optimizerGateReason != null;
            const ef = c.enrichedFields || {};
            const sellerPct = parseSellerPct(ef.seller_feedback_pct);
            const sellerCount = ef.seller_feedback_count ?? null;
            const delivery = formatDeliveryRange(
              ef.delivery_min_date,
              ef.delivery_max_date
            );
            const warranty = formatWarranty(ef.warranty_raw);
            // 运费: 用于 PRICE 列副行, 让展示价与排序用的 landed (price+shipping) 一致。
            // null = 缺失, 0 = 免运费, >0 = 有运费。
            const shipRaw = ef.shipping_cost;
            const shipParsed =
              shipRaw == null || String(shipRaw).trim() === ""
                ? null
                : Number(shipRaw);
            const shipping =
              shipParsed != null && !Number.isNaN(shipParsed) ? shipParsed : null;
            const priceNum = Number(c.price);

            return (
              <Fragment key={c.id}>
                {/* pick 徽章行: 该候选在「其他」preset 下是 Rank 1 时显示 */}
                {showPickRow && (
                  <tr className={isTopPick ? "bg-teal-50/50" : ""}>
                    <td colSpan={8} className="px-3 pt-2 pb-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PickBadges
                          presets={picks}
                          currentPreset={currentPreset}
                        />
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
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {isTopPick &&
                        (() => {
                          // #1 标记: 当前排序 preset 的图标形状, 但色走品牌青
                          // (与 Ranked-by chip / 按钮一致), 不上 preset 色。
                          const cm = PRESET_META[currentPreset];
                          const CurIcon = cm?.Icon ?? Award;
                          return (
                            <span
                              title={`Top pick for ${cm?.label ?? currentPreset} (current sort)`}
                              className="shrink-0 text-[#00B4A6]"
                            >
                              <CurIcon size={12} />
                            </span>
                          );
                        })()}
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
                          <span
                            style={{ color: NEUTRAL_BADGE }}
                            className="mt-0.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium bg-slate-100"
                          >
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

                  {/* WARRANTY (可换行, 不撑宽表格) */}
                  <td className="px-3 py-2 text-gray-600 break-words">
                    {warranty ?? "—"}
                  </td>

                  {/* PRICE (主价 + 运费副行, 与 landed 排序口径一致)。
                      副行限制在本单元格内换行, 不溢出到 Score / Select。 */}
                  <td className="px-3 py-2 text-right align-top">
                    <div className="font-semibold text-[#1A1A2E] whitespace-nowrap">
                      ${c.price}
                    </div>
                    {shipping == null ? (
                      <div className="text-[10px] leading-tight text-amber-600 break-words">
                        + shipping at checkout
                      </div>
                    ) : shipping === 0 ? (
                      <div className="text-[10px] leading-tight text-green-600">
                        Free shipping
                      </div>
                    ) : (
                      <div className="text-[10px] leading-tight text-gray-400 break-words">
                        ${(priceNum + shipping).toFixed(2)} total · incl. $
                        {shipping.toFixed(2)} ship
                      </div>
                    )}
                  </td>

                  {/* SCORE (总分 + speed 小字) / Filtered */}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {c.optimizerTotal != null ? (
                      <span
                        className="text-gray-700 tabular-nums decoration-dotted decoration-gray-300 underline-offset-4 underline"
                        title={`price: ${c.optimizerPriceScore?.toFixed(0) ?? "—"} | speed: ${c.optimizerSpeedScore?.toFixed(0) ?? "—"} | quality: ${c.optimizerQualityScore?.toFixed(0) ?? "—"}`}
                      >
                        {c.optimizerTotal.toFixed(0)}
                      </span>
                    ) : isGated ? (
                      <span
                        title={
                          humanizeGateReason(c.optimizerGateReason) ??
                          "Filtered out by a hard gate"
                        }
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 cursor-help"
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
                    <td colSpan={9} className="px-3 py-4 border-b border-gray-100">
                      <CandidateDetail candidate={c} />
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
