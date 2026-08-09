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

/**
 * UI 里给用户看的 preset (Job Status 胶囊)。顺序即展示顺序, Budget 在前 (它是默认)。
 *
 * 刻意与 VALID_PRESETS 分开: 后端仍然接受全部 8 个名字, prewarm 也照旧算 4 个
 * preset —— 隐藏纯粹是展示层的事。这样历史记录里存的 Balanced/Premium、以及
 * 已经预热好的缓存都还能正常解析, 不用改数据。
 */
export const SHOWN_PRESETS = ["Budget", "Rush"] as const;

export const SHOWN_PRESET_SET: ReadonlySet<string> = new Set(SHOWN_PRESETS);

/** 展示层的"全赢"阈值: 在所有可见 preset 下都是 Top1 → Best overall */
export const SHOWN_PRESET_COUNT = SHOWN_PRESETS.length;

// 未传/非法 preset 的兜底
export const DEFAULT_PRESET = "Budget";
