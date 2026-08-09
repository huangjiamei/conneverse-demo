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
 * UI 里给用户看的 preset (Job Status 胶囊 / pick 徽章)。顺序即展示顺序。
 *
 * 只作用于 admin 侧的界面 —— admin view (/search/history/[id] 的候选表格) 和
 * RO 零件搜索页,两者都只有平台管理员能进。
 *
 * 门店用户走的 /search 不读这个数组: 那边的 Job Status 选择器和
 * "Ranked by X" 徽章已经整体移除,因为客户视图的 heroes 是从三份 preset 排名里
 * 挑的 (Cheapest / Fastest / Best overall),本身不随当前 preset 变化,
 * 切了看不出区别。
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
