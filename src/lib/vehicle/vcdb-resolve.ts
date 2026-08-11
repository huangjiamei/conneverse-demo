/**
 * 解码结果 (year + make + model 文本) → VCdb BaseVehicleID。
 *
 * 零件适配以 BaseVehicleID 为锚, 所以这一步的目标就是拿到它。三种出口:
 *   resolved  —— 唯一命中, 前端拿去预选并让用户确认
 *   ambiguous —— 年份+品牌对上了, 车型对不上或不唯一 → 回退选择器让用户点
 *   unmatched —— 连年份或品牌都对不上 → 回退到完全手动
 *
 * 原则: 对不上就交给用户, 绝不硬猜。VIN 解码 ≠ VCdb 命名, 猜错一次
 * 就是一颗装不上的零件。
 *
 * make 归一化复用 src/lib/vehicle/make-normalize.ts (和 CCC 工单导入同一份表)。
 */

import { prisma } from "@/lib/prisma";
import { matchMake } from "./make-normalize";

export type ModelCandidate = { id: number; name: string };

export type ResolveReason =
  | "year_missing"
  | "year_not_in_vcdb"
  | "make_missing"
  | "make_not_in_vcdb"
  | "model_missing"
  | "model_not_matched"
  | "multiple_models"
  | "no_base_vehicle";

export type VcdbResolution =
  | {
      status: "resolved";
      /** exact = 归一化后完全相等; fuzzy = 靠去噪/前缀匹配上的, 文案要更保守 */
      confidence: "exact" | "fuzzy";
      year: number;
      makeId: number;
      makeName: string;
      modelId: number;
      modelName: string;
      baseVehicleId: number;
    }
  | {
      status: "ambiguous";
      reason: Extract<ResolveReason, "model_not_matched" | "multiple_models">;
      year: number;
      makeId: number;
      makeName: string;
      /** 收窄后的候选 (可能为空 = 完全没匹配上, 让用户看全量列表) */
      candidates: ModelCandidate[];
    }
  | {
      status: "unmatched";
      reason: ResolveReason;
      /** 已经确认存在于 VCdb 的部分, 用来预填选择器 */
      year: number | null;
      makeId: number | null;
      makeName: string | null;
    };

/** 收窄候选给前端做 chips 时的上限, 超过就别摆一屏 */
const MAX_CANDIDATES = 12;

/**
 * 车型名 key: 只留 A-Z0-9。
 * "F-150" / "F 150" / "f150" → "F150"
 */
function modelKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * 特例表: key 和去噪都救不了的车型。左边写 modelKey() 之后的形式。
 * 只收「一对一确定」的映射 —— 像 "SILVERADO" 这种同时对应 1500/2500/3500 的
 * 绝不能写进来, 让它走 ambiguous 交给用户点。
 *
 * 现在是空的 —— 下面三级匹配够用了, 等真见到对不上的再往里加, 例如:
 *   RAMPICKUP1500: "Ram 1500"
 */
export const MODEL_ALIASES: Record<string, string> = {};

/** 去噪时剥掉的系列词 —— "3-Series" 和 "3" 要能对上 */
const SERIES_WORDS = ["SERIES", "CLASS", "MODEL"];

/** 二级 key: 在 modelKey 基础上再剥系列词。"3SERIES" → "3" */
function denoisedKey(raw: string): string {
  let k = modelKey(raw);
  const alias = MODEL_ALIASES[k];
  if (alias) k = modelKey(alias);
  for (const w of SERIES_WORDS) {
    if (k.length > w.length) k = k.split(w).join("");
  }
  return k;
}

/**
 * 用 vPIC 的 Series 在「已经匹配上的候选」里做收窄, 只用于区分车型本身。
 *
 * 真实例子: vPIC 把 Silverado 拆成 Model="Silverado" + Series="1500",
 * VCdb 叫 "Silverado 1500" —— 光看 Model 会同时命中 1500/2500HD/3500HD。
 *
 * 注意这不违反「不从 VIN 锁 sub-model」: 收窄只在 model 这一层做, 而且只在
 * 候选里筛, 筛不出唯一就原样退回去让用户选; sub-model/trim 仍然全交给用户。
 */
function narrowBySeries(
  hits: ModelCandidate[],
  rawModel: string,
  series: string | null
): ModelCandidate[] {
  if (!series || hits.length <= 1) return hits;

  // "Silverado" + "1500" → "SILVERADO1500"
  const combined = modelKey(`${rawModel}${series}`);
  const joined = hits.filter((m) => modelKey(m.name) === combined);
  if (joined.length === 1) return joined;

  const sKey = modelKey(series);
  if (sKey.length >= 2) {
    const contains = hits.filter((m) => modelKey(m.name).includes(sKey));
    if (contains.length === 1) return contains;
  }
  return hits;
}

/**
 * 车型匹配, 从严到宽逐级放宽; 某一级有命中就停在那一级
 * (不把不同级别的结果混在一起, 否则严格命中会被宽松命中淹掉)。
 */
function matchModels(
  rawModel: string,
  models: ModelCandidate[]
): { hits: ModelCandidate[]; exact: boolean } {
  const key = modelKey(rawModel);
  if (!key) return { hits: [], exact: false };

  // 1. 归一化后完全相等
  const exact = models.filter((m) => modelKey(m.name) === key);
  if (exact.length > 0) return { hits: exact, exact: true };

  // 2. 别名 + 去掉系列词后相等
  const dKey = denoisedKey(rawModel);
  if (dKey) {
    const denoised = models.filter((m) => denoisedKey(m.name) === dKey);
    if (denoised.length > 0) return { hits: denoised, exact: false };
  }

  // 3. 前缀: VCdb 名字更长 ("Silverado" → "Silverado 1500")。
  //    3 位以下不做前缀匹配, 太容易命中一堆无关车型。
  if (key.length >= 3) {
    const prefix = models.filter((m) => modelKey(m.name).startsWith(key));
    if (prefix.length > 0) return { hits: prefix, exact: false };

    // 4. 反向前缀: 解码结果更长 ("Silverado 1500 Classic" → "Silverado 1500")
    const reverse = models.filter((m) => {
      const mk = modelKey(m.name);
      return mk.length >= 3 && key.startsWith(mk);
    });
    if (reverse.length > 0) {
      // 多个时取最长的那个 (最具体), 但仍可能并列
      const longest = Math.max(...reverse.map((m) => modelKey(m.name).length));
      return {
        hits: reverse.filter((m) => modelKey(m.name).length === longest),
        exact: false,
      };
    }
  }

  return { hits: [], exact: false };
}

export async function resolveToBaseVehicle(input: {
  year: number | null;
  make: string | null;
  model: string | null;
  /** vPIC 的 Series, 只在车型候选不唯一时用来收窄 (见 narrowBySeries) */
  series?: string | null;
  /** vPIC 的 Trim, 只在 Model 完全没命中时当车型名试一次 (见下面的兜底) */
  trim?: string | null;
}): Promise<VcdbResolution> {
  const { year, make, model, series = null, trim = null } = input;

  if (year == null) {
    return { status: "unmatched", reason: "year_missing", year: null, makeId: null, makeName: null };
  }
  const yearRow = await prisma.vcdbYear.findUnique({ where: { id: year }, select: { id: true } });
  if (!yearRow) {
    return {
      status: "unmatched",
      reason: "year_not_in_vcdb",
      year: null,
      makeId: null,
      makeName: null,
    };
  }

  if (!make) {
    return { status: "unmatched", reason: "make_missing", year, makeId: null, makeName: null };
  }
  // 该年份下的品牌一次拉全 (几十行), 在 JS 里按归一化 key 比 ——
  // 标点/大小写差异在 SQL 里表达不出来。
  const makes = await prisma.vcdbMake.findMany({
    where: { baseVehicles: { some: { yearId: year } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const makeHit = matchMake(make, makes);
  if (!makeHit) {
    return { status: "unmatched", reason: "make_not_in_vcdb", year, makeId: null, makeName: null };
  }

  if (!model) {
    return {
      status: "ambiguous",
      reason: "model_not_matched",
      year,
      makeId: makeHit.id,
      makeName: makeHit.name,
      candidates: [],
    };
  }

  const models = await prisma.vcdbModel.findMany({
    where: { baseVehicles: { some: { yearId: year, makeId: makeHit.id } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const { hits, exact } = matchModels(model, models);
  // 命中多个时再拿 Series 收窄一次; 收不窄就原样交给用户挑
  let narrowed = narrowBySeries(hits, model, series);

  // 兜底: 德系车 vPIC 的 Model 给的是车系 ("C-Class"), 真正对得上 VCdb model
  // 的那个名字 ("C250") 被它放进了 Trim。只在前面一个都没命中时试, 且只认
  // 归一化后完全相等 —— 大多数品牌的 Trim 是 "LT"/"EX-V6" 这种, 匹配不上
  // 任何 model, 自然落空, 不会把人带偏。
  if (narrowed.length === 0 && trim) {
    const tKey = modelKey(trim);
    const byTrim = tKey ? models.filter((m) => modelKey(m.name) === tKey) : [];
    // exact 此时必为 false → confidence 自动算成 fuzzy, 文案会更保守
    if (byTrim.length === 1) narrowed = byTrim;
  }

  if (narrowed.length !== 1) {
    return {
      status: "ambiguous",
      reason: narrowed.length === 0 ? "model_not_matched" : "multiple_models",
      year,
      makeId: makeHit.id,
      makeName: makeHit.name,
      candidates: narrowed.slice(0, MAX_CANDIDATES),
    };
  }

  const modelHit = narrowed[0]!;
  // 靠 Series 才收敛到唯一的, 算 fuzzy —— 文案要更保守
  const confidence = exact && narrowed.length === hits.length ? "exact" : "fuzzy";
  const base = await prisma.vcdbBaseVehicle.findFirst({
    where: { yearId: year, makeId: makeHit.id, modelId: modelHit.id },
    select: { id: true },
  });
  if (!base) {
    // models 是从 baseVehicles 反查出来的, 理论上到不了这里
    return {
      status: "unmatched",
      reason: "no_base_vehicle",
      year,
      makeId: makeHit.id,
      makeName: makeHit.name,
    };
  }

  return {
    status: "resolved",
    confidence,
    year,
    makeId: makeHit.id,
    makeName: makeHit.name,
    modelId: modelHit.id,
    modelName: modelHit.name,
    baseVehicleId: base.id,
  };
}
