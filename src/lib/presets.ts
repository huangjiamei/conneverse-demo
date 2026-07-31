/**
 * Preset 常量 (单一来源)。
 *
 * V2 四个正式名 + 老名别名 (matcher 侧 presets.py 两套都收)。
 * 之前 search-vehicle / switch-preset 各硬编码一份, 现在统一到这里。
 */

export const VALID_PRESETS = [
  // V2 正式名
  "Rush",
  "Balanced",
  "Budget",
  "Premium",
  // 老名别名
  "sameDayJob",
  "costFirst",
  "qualityFirst",
  "scheduled",
] as const;

export const VALID_PRESET_SET: ReadonlySet<string> = new Set(VALID_PRESETS);

// 未传/非法 preset 的兜底
export const DEFAULT_PRESET = "Balanced";
