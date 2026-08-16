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
import { Award, Star, ChevronRight, ChevronDown } from "lucide-react";
import {
  type Candidate,
  CandidateDetail,
  formatDeliveryRange,
  formatWarranty,
  parseSellerPct,
  humanizeGateReason,
} from "@/components/CandidateCard";
import { PlaceOrderPlaceholder } from "@/components/PlaceOrderButton";
import {
  PRESET_META,
  PRESET_COLORS,
  NEUTRAL_BADGE,
} from "./presetMeta";
import { SHOWN_PRESETS, SHOWN_PRESET_SET, SHOWN_PRESET_COUNT } from "@/lib/presets";

/**
 * pick 徽章只跨「可见的」preset 比较。
 * prewarm 仍然算 4 个 preset (见 prewarm-presets.ts), 但用户只看得到 Budget / Rush,
 * 给他们看隐藏 preset 的徽章没有意义。
 */
function shownPicks(picks: string[] | undefined): string[] {
  return (picks ?? [])
    .filter((p) => SHOWN_PRESET_SET.has(p))
    .sort((a, b) => SHOWN_PRESETS.indexOf(a as never) - SHOWN_PRESETS.indexOf(b as never));
}

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
 * - 所有可见 preset (Budget + Rush) 全赢 → 合并成单个 "★ Best overall"。
 * - 其余 → 每个其他可见 preset 一个小图标 (hover 出名字)。
 *
 * presets 传进来前已经用 shownPicks() 过滤过, 这里只按可见数量判断。
 */
function PickBadges({
  presets,
  currentPreset,
}: {
  presets: string[];
  currentPreset: string;
}) {
  // 无差别碾压: 所有可见 preset 都是 Top1 → 单个玫红 ★ Best overall (浅底 + 主色文字)
  // SHOWN_PRESET_COUNT 为 0 (胶囊全隐藏) 时这条不成立,否则空数组会命中
  if (SHOWN_PRESET_COUNT > 0 && presets.length >= SHOWN_PRESET_COUNT) {
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

  // 只显示「其他」preset 的 Top1, 去掉当前排序视角 (顺序在 shownPicks 里已排好)
  const others = presets.filter((p) => p !== currentPreset);

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
          <col className="w-[11%]" /> {/* Place Order */}
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
            // 徽章行是否有内容: 可见 preset 全赢, 或去掉当前 preset 后仍有其他可见 preset
            const picks = shownPicks(c.pickInPresets);
            const showPickRow =
              picks.length > 0 &&
              (picks.length >= SHOWN_PRESET_COUNT ||
                picks.some((p) => p !== currentPreset));
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
                      副行限制在本单元格内换行, 不溢出到 Score / Place Order。 */}
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

                  {/* 下单入口 —— 功能未做,统一禁用 */}
                  <td className="px-3 py-2">
                    <PlaceOrderPlaceholder size="sm" />
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
