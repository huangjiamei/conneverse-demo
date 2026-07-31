/**
 * V2 四个 preset 的共享元数据 (标签 + 图标) 和配色。
 *
 * 配色规则 (刻意收窄):
 *   - 品牌青 (#00B4A6) 只给"当前排序视角": Job Status 按钮选中态、表头
 *     "Ranked by X" chip、行内 #1 标记。这些不上 preset 色。
 *   - preset 主题色 (PRESET_COLORS) 只给 pick 徽章 (浅底 + 主色文字)。
 *   - eBay 中性标 (Top Rated 等) 走中性灰 NEUTRAL_BADGE。
 */
import { Gauge, Scale, DollarSign, Award, type LucideIcon } from "lucide-react";

export type PresetMeta = {
  label: string;
  Icon: LucideIcon;
};

export const PRESET_META: Record<string, PresetMeta> = {
  Rush: { label: "Rush", Icon: Gauge },
  Balanced: { label: "Balanced", Icon: Scale },
  Budget: { label: "Budget", Icon: DollarSign },
  Premium: { label: "Premium", Icon: Award },
};

/**
 * pick 徽章配色: `bg` 底 + `text` 文字 (统一"浅底 + 主色文字")。
 * `text` 同时兼作 chip 的实心填充色 (chip = text 底 + 白字), 五色逻辑统一,
 * 无特例。ONLY pick 徽章 / Ranked-by chip 引用, 别处别用。
 */
export const PRESET_COLORS: Record<string, { bg: string; text: string }> = {
  Rush: { bg: "#fee2e2", text: "#dc2626" }, // 红
  Balanced: { bg: "#dbeafe", text: "#2563eb" }, // 蓝
  Budget: { bg: "#fef3c7", text: "#b45309" }, // 琥珀
  Premium: { bg: "#f3e8ff", text: "#7c3aed" }, // 紫
  BestOverall: { bg: "#fce7f3", text: "#be185d" }, // 玫红
};

/** eBay 中性标 (Top Rated 等) 文字色 */
export const NEUTRAL_BADGE = "#64748b";

/** 品牌青 (当前排序视角: 按钮 / chip / #1 标记) */
export const BRAND_TEAL = "#00B4A6";

/** canonical 顺序, 徽章排序稳定 */
export const PRESET_ORDER = ["Rush", "Balanced", "Budget", "Premium"];
export const ALL_PRESET_COUNT = PRESET_ORDER.length;
