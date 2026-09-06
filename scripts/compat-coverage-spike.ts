/**
 * Spike: checkCompatibility 覆盖率测量 (只测量, 不碰 pipeline/service/判定逻辑, 不接线上)。
 * 需求见 docs/prompt.md。复用 ebay-align.ts + vcdb-config.ts, 一行不改它们。
 *
 * 策略: base-first —— 先只用 Year/Make/Model 调一次 checkCompatibility:
 *   - 11505            → listing 本身没挂 ACES (listing 侧), 不必对齐, 停。
 *   - COMPATIBLE/NOT_* → 靠 Y/M/M 就裁定了 (可用), 停。
 *   - 11504 (缺 Trim/Engine) → listing 有 ACES, 才去 VCdb 归一化 + 对齐 Trim/Engine 重试。
 *   这样只有"确实需要"的那批才打 Taxonomy 对齐接口, 省额度。
 *
 * 运行 (默认 node 是 v18 会挂 Prisma, 用 nvm v24; eBay 凭据来自 matcher/.env):
 *   NODE24=~/.nvm/versions/node/v24.14.0/bin/node
 *   set -a; . ../conneverse-part-matcher/.env; set +a
 *   $NODE24 --import tsx scripts/compat-coverage-spike.ts [mainN] [col5N]
 *
 * 数据路径可用 env 覆盖 (默认指向已有样本):
 *   COMPAT_SAMPLE   V4/compat_sample.jsonl        (主样本: itemId+categoryId+我方车辆)
 *   MATCHER_OUTPUTS 逗号分隔的 matcher 输出 jsonl   (第 5 栏: MPN 命中 item_id+我方车辆+part_number)
 *
 * 输出: docs/compat-coverage-report.md + docs/compat-coverage-rows.csv
 */
import fs from "fs";
import { prisma } from "../src/lib/prisma";
import {
  getEbayToken,
  getCompatibilityPropertyValues,
  alignModel,
  alignTrim,
  alignEngine,
} from "../src/lib/vehicle/ebay-align";
import { resolveVehicleConfig, formatVehicleForEbay } from "../src/lib/vehicle/vcdb-config";

// ---- 配置 ----
const SVC = process.env.SERVICE_DIR ?? "/Users/huangjiamei/Cursor/conneverse/backend/service";
const COMPAT_SAMPLE = process.env.COMPAT_SAMPLE ?? `${SVC}/V4/compat_sample.jsonl`;
const MATCHER_OUTPUTS = (process.env.MATCHER_OUTPUTS ??
  `${SVC}/v3/output_part_01.jsonl,${SVC}/v3/output_part_01_new.jsonl`)
  .split(",").map((s) => s.trim()).filter(Boolean);
const MAIN_N = Number(process.argv[2] || 400);
const COL5_N = Number(process.argv[3] || 200);
const MAX_PAIRS = 6;        // 每件最多试的 (Trim,Engine) 对
const MAX_VCDB = 6;         // 每个 Y/M/M 最多解析几辆 VCdb 车 (聚合 submodel/engine)
const THROTTLE_MS = 120;    // 每条之间的小延时, 缓 eBay 限流
const OUT_MD = "docs/compat-coverage-report.md";
const OUT_CSV = "docs/compat-coverage-rows.csv";

// matcher 输出里的 4 字符 make 缩写 → VCdb/eBay 全名 (只覆盖第 5 栏实际出现的)
const COL5_MAKE: Record<string, string> = {
  FORD: "Ford", HOND: "Honda", KIA: "Kia", TOYO: "Toyota", CHEV: "Chevrolet",
  SUBA: "Subaru", JEEP: "Jeep", GMC: "GMC", RAM: "Ram", BENZ: "Mercedes-Benz", HYUN: "Hyundai",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- eBay: Taxonomy 取值 (自带一份, 好把非 200 状态暴露出来判限流) ----
let taxNon200 = 0;
async function taxVals(categoryId: string, prop: "Model" | "Trim" | "Engine", filter: Record<string, string>, token: string): Promise<string[]> {
  const f = Object.entries(filter).map(([k, v]) => `${k}:${v}`).join(",");
  const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/100/get_compatibility_property_values?category_id=${categoryId}&compatibility_property=${prop}&filter=${encodeURIComponent(f)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { taxNon200++; return []; }
  const j = await r.json();
  return (j.compatibilityPropertyValues ?? []).map((v: { value: string }) => v.value);
}

// ---- eBay: check_compatibility, 返回 status + 所有 errorId (warnings 和 errors 合并) ----
type CompatResult = { status: string; errorIds: number[]; httpOk: boolean };
async function checkCompat(token: string, itemId: string, props: Record<string, string>): Promise<CompatResult> {
  const compatibilityProperties = Object.entries(props)
    .filter(([, v]) => v && String(v).trim())
    .map(([name, value]) => ({ name, value }));
  const r = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(itemId)}/check_compatibility`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Language": "en-US",
    },
    body: JSON.stringify({ compatibilityProperties }),
  });
  const j: any = await r.json().catch(() => ({}));
  const errorIds = [
    ...(j.warnings ?? []).map((e: any) => e.errorId),
    ...(j.errors ?? []).map((e: any) => e.errorId),
  ].filter((x) => typeof x === "number");
  if (!r.ok) return { status: `ERR_${r.status}`, errorIds, httpOk: false };
  return { status: j.compatibilityStatus || "UNDETERMINED", errorIds, httpOk: true };
}

// ---- VCdb: Y/M/M → 候选 vehicleId (全名 model, 精确优先) ----
async function resolveVcdb(year: number, make: string, model: string): Promise<{ id: number; model: string }[]> {
  return prisma.$queryRawUnsafe<{ id: number; model: string }[]>(
    `SELECT v.id, md.name AS model
     FROM "VcdbVehicle" v
     JOIN "VcdbBaseVehicle" bv ON bv.id=v."baseVehicleId"
     JOIN "VcdbMake" mk ON mk.id=bv."makeId"
     JOIN "VcdbModel" md ON md.id=bv."modelId"
     WHERE bv."yearId"=$1 AND lower(mk.name)=lower($2)
       AND (lower(md.name)=lower($3) OR lower(md.name) LIKE lower($3)||' %' OR lower(md.name) LIKE '%'||lower($3)||'%')
     ORDER BY (lower(md.name)=lower($3)) DESC, length(md.name) ASC
     LIMIT 8`,
    year, make, model
  );
}

type Engine = { liter: string | null; cid: string | null; cylinders: string | null; blockType: string | null; fuelType: string; aspiration?: string; label: string };
type OurAgg = { model: string; submodels: string[]; engines: Engine[]; vcdbResolved: boolean };

// Y/M/M → 聚合 (全名 model + 所有 submodel + 所有 engine)
async function normalizeVehicle(year: number, make: string, model: string): Promise<OurAgg | null> {
  const rows = await resolveVcdb(year, make, model);
  if (!rows.length) return null;
  const fullModel = rows[0].model;
  const submodels = new Set<string>();
  const engines = new Map<string, Engine>();
  for (const row of rows.filter((r) => r.model === fullModel).slice(0, MAX_VCDB)) {
    const cfg = await resolveVehicleConfig({ vehicleId: row.id });
    if (!cfg) continue;
    const ev = formatVehicleForEbay(cfg);
    if (ev.trim) submodels.add(ev.trim);
    for (const e of ev.engines) if (e.label) engines.set(e.label, e as Engine);
  }
  return { model: fullModel, submodels: [...submodels], engines: [...engines.values()], vcdbResolved: true };
}

type Align = {
  modelMatched: boolean; trimMatched: boolean; engineMatched: boolean;
  trims: string[]; pairs: { trim: string; engine: string }[];
  ebayTrimCount: number; ebayEngineCount: number;
};
// 用导出的 align* 助手对齐全部 submodel/engine (Taxonomy 每个 model 只取一次目录值)
async function alignAll(categoryId: string, year: string, make: string, agg: OurAgg, token: string): Promise<Align> {
  const base = { Year: year, Make: make };
  const ebayModels = await taxVals(categoryId, "Model", base, token);
  const aligned = alignModel(agg.model, ebayModels);
  const useModel = aligned ?? agg.model;
  const filter = { ...base, Model: useModel };
  const [ebayTrims, ebayEngines] = await Promise.all([
    taxVals(categoryId, "Trim", filter, token),
    taxVals(categoryId, "Engine", filter, token),
  ]);
  const trims = [...new Set(agg.submodels.flatMap((sm) => alignTrim(sm, ebayTrims)))];
  const engAligned = agg.engines.map((e) => alignEngine(e, ebayEngines)).flat();
  const engSet = [...new Set(engAligned)];
  const pairs: { trim: string; engine: string }[] = [];
  for (const t of trims) for (const ev of engSet) pairs.push({ trim: t, engine: ev });
  return {
    modelMatched: aligned != null,
    trimMatched: trims.length > 0,
    engineMatched: engSet.length > 0,
    trims, pairs,
    ebayTrimCount: ebayTrims.length, ebayEngineCount: ebayEngines.length,
  };
}

// ============================================================
// 单条候选的完整测量 (base-first → 需要才对齐)
// ============================================================
type Outcome =
  | "COMPATIBLE" | "NOT_COMPATIBLE"           // 可用裁定
  | "UND_LISTING_NO_ACES"                     // UNDETERMINED: listing 没挂 ACES (11505)
  | "UND_OUR_NORMALIZE_FAIL"                  // UNDETERMINED: listing 有 ACES 但我方没归一化出 Trim/Engine (11504 且无 pair)
  | "UND_AMBIGUOUS"                           // UNDETERMINED: 供了完整 Trim/Engine 仍未定 (listing ACES 不全/其它)
  | "OUR_VCDB_UNRESOLVED"                     // 我方车辆连 VCdb 都对不上 (归一化失败, 早于 eBay)
  | "ERROR";                                  // eBay 调用异常 (非 11504/11505)

type Row = {
  itemId: string; category?: string; year: string; make: string; model: string;
  outcome: Outcome; base_status: string; final_status: string; errorIds: string;
  vcdbResolved: boolean; modelMatched: boolean; trimMatched: boolean; engineMatched: boolean;
  pairs: number; listingHasAces: boolean;
};

async function measure(
  token: string, itemId: string, categoryId: string | null,
  year: string, make: string, model: string, category?: string,
): Promise<Row> {
  const base: Row = {
    itemId, category, year, make, model,
    outcome: "ERROR", base_status: "", final_status: "", errorIds: "",
    vcdbResolved: false, modelMatched: false, trimMatched: false, engineMatched: false,
    pairs: 0, listingHasAces: false,
  };
  // 1) base-first: 只 Y/M/M
  const b = await checkCompat(token, itemId, { Year: year, Make: make, Model: model });
  base.base_status = b.status; base.final_status = b.status;
  base.errorIds = b.errorIds.join("|");
  if (b.status === "COMPATIBLE") return { ...base, outcome: "COMPATIBLE", listingHasAces: true };
  if (b.status === "NOT_COMPATIBLE") return { ...base, outcome: "NOT_COMPATIBLE", listingHasAces: true };
  if (b.errorIds.includes(11505)) return { ...base, outcome: "UND_LISTING_NO_ACES", listingHasAces: false };
  const needsAttrs = b.errorIds.includes(11504);
  if (!needsAttrs && !b.httpOk) return { ...base, outcome: "ERROR" };
  if (!needsAttrs) return { ...base, outcome: "UND_AMBIGUOUS", listingHasAces: true };

  // 到这里: listing 有 ACES 且要 Trim/Engine → 归一化 + 对齐
  base.listingHasAces = true;
  const agg = await normalizeVehicle(Number(year), make, model);
  if (!agg) return { ...base, outcome: "OUR_VCDB_UNRESOLVED" };
  base.vcdbResolved = true;
  if (!categoryId) return { ...base, outcome: "UND_OUR_NORMALIZE_FAIL" }; // 无 category 无法查 Taxonomy 目录
  const al = await alignAll(categoryId, year, make, agg, token);
  base.modelMatched = al.modelMatched; base.trimMatched = al.trimMatched;
  base.engineMatched = al.engineMatched; base.pairs = al.pairs.length;
  if (!al.pairs.length) return { ...base, outcome: "UND_OUR_NORMALIZE_FAIL" };

  // 2) 用对齐后的 (Trim,Engine) 对重试, 早停于 COMPATIBLE
  // Model 仍传原 model 名 (eBay checkCompatibility 认全名), 对齐结果只用于产出 Trim/Engine
  let best: CompatResult | null = null;
  for (const p of al.pairs.slice(0, MAX_PAIRS)) {
    const res = await checkCompat(token, itemId, { Year: year, Make: make, Model: model, Trim: p.trim, Engine: p.engine });
    base.final_status = res.status; base.errorIds = res.errorIds.join("|");
    if (res.status === "COMPATIBLE") return { ...base, outcome: "COMPATIBLE" };
    if (res.status === "NOT_COMPATIBLE") best = res;
    else if (!best) best = res;
  }
  if (best?.status === "NOT_COMPATIBLE") return { ...base, outcome: "NOT_COMPATIBLE" };
  return { ...base, outcome: "UND_AMBIGUOUS" };
}

// ---- 分层抽样: 按 category 均匀取 n 条 ----
function stratify<T>(items: T[], keyOf: (t: T) => string, n: number): T[] {
  if (items.length <= n) return items;
  const groups = new Map<string, T[]>();
  for (const it of items) { const k = keyOf(it); (groups.get(k) ?? groups.set(k, []).get(k)!).push(it); }
  const keys = [...groups.keys()];
  const out: T[] = [];
  let i = 0;
  while (out.length < n) {
    const g = groups.get(keys[i % keys.length])!;
    const idx = Math.floor(i / keys.length);
    if (idx < g.length) out.push(g[idx]);
    i++;
    if (i > items.length * 2) break;
  }
  return out.slice(0, n);
}

async function runMain(token: string): Promise<Row[]> {
  const all = fs.readFileSync(COMPAT_SAMPLE, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const subset = stratify(all, (r: any) => r.category ?? "?", MAIN_N);
  console.error(`\n[main] ${subset.length}/${all.length} 条 (按 category 分层)`);
  const rows: Row[] = [];
  let done = 0;
  for (const it of subset) {
    done++;
    try {
      const r = await measure(token, it.itemId, it.categoryId ?? null, String(it.vehicle.year), it.vehicle.make, it.vehicle.model, it.category);
      rows.push(r);
    } catch (e) {
      rows.push({ itemId: it.itemId, category: it.category, year: String(it.vehicle.year), make: it.vehicle.make, model: it.vehicle.model,
        outcome: "ERROR", base_status: "", final_status: `EXC:${String(e).slice(0, 60)}`, errorIds: "",
        vcdbResolved: false, modelMatched: false, trimMatched: false, engineMatched: false, pairs: 0, listingHasAces: false });
    }
    if (done % 20 === 0) console.error(`  main …${done}/${subset.length}`);
    await sleep(THROTTLE_MS);
  }
  return rows;
}

// ---- 第 5 栏: matcher 输出里 EXACT_MPN_MATCH 候选 ----
type Col5Row = Row & { partNumber: string };
async function runCol5(token: string): Promise<Col5Row[]> {
  const seen = new Set<string>();
  const cands: { itemId: string; year: string; make: string; model: string; pn: string }[] = [];
  for (const f of MATCHER_OUTPUTS) {
    if (!fs.existsSync(f)) { console.error(`  [col5] 缺 ${f}`); continue; }
    for (const line of fs.readFileSync(f, "utf8").trim().split("\n")) {
      const r = JSON.parse(line);
      const v = r.source_part_info?.vehicle ?? {};
      const pn = r.source_part_info?.part_number ?? "";
      for (const c of r.candidate_info_list ?? []) {
        if (c.candidate_label_source === "EXACT_MPN_MATCH" && c.item_id && !seen.has(c.item_id)) {
          seen.add(c.item_id);
          const rawMake = String(v.make ?? "");
          const make = COL5_MAKE[rawMake.toUpperCase()] ?? rawMake;
          cands.push({ itemId: c.item_id, year: String(v.year ?? ""), make, model: String(v.model_guess ?? ""), pn });
        }
      }
    }
  }
  const subset = cands.slice(0, COL5_N);
  console.error(`\n[col5] ${subset.length}/${cands.length} 个 MPN 命中候选 (去重后)`);
  const rows: Col5Row[] = [];
  let done = 0;
  for (const c of subset) {
    done++;
    let categoryId: string | null = null;
    try {
      // 需要对齐时才取 categoryId (getItem); 先 base-first, 若 11504 再补 category
      const b = await checkCompat(token, c.itemId, { Year: c.year, Make: c.make, Model: c.model });
      if (b.errorIds.includes(11504)) {
        // 注意: fieldgroups=COMPACT 会把 categoryId 抹掉; 用默认 getItem 才带 categoryId。
        const gi: any = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(c.itemId)}`, {
          headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
        }).then((r) => r.json()).catch(() => ({}));
        categoryId = gi?.categoryId ?? null;
      }
      const r = await measure(token, c.itemId, categoryId, c.year, c.make, c.model);
      rows.push({ ...r, partNumber: c.pn });
    } catch (e) {
      rows.push({ itemId: c.itemId, year: c.year, make: c.make, model: c.model, partNumber: c.pn,
        outcome: "ERROR", base_status: "", final_status: `EXC:${String(e).slice(0, 60)}`, errorIds: "",
        vcdbResolved: false, modelMatched: false, trimMatched: false, engineMatched: false, pairs: 0, listingHasAces: false });
    }
    if (done % 20 === 0) console.error(`  col5 …${done}/${subset.length}`);
    await sleep(THROTTLE_MS);
  }
  return rows;
}

// ============================================================
// 报告
// ============================================================
function pct(n: number, d: number): string { return d ? `${((n / d) * 100).toFixed(1)}%` : "—"; }
function tally<T>(rows: T[], keyOf: (t: T) => string): Record<string, number> {
  const c: Record<string, number> = {};
  for (const r of rows) c[keyOf(r)] = (c[keyOf(r)] ?? 0) + 1;
  return c;
}

function buildReport(main: Row[], col5: Col5Row[]): string {
  const N = main.length;
  const by = tally(main, (r) => r.outcome);
  const usable = (by.COMPATIBLE ?? 0) + (by.NOT_COMPATIBLE ?? 0);
  const undLans = by.UND_LISTING_NO_ACES ?? 0;
  const undOur = by.UND_OUR_NORMALIZE_FAIL ?? 0;
  const undAmb = by.UND_AMBIGUOUS ?? 0;
  const vcdbUnres = by.OUR_VCDB_UNRESOLVED ?? 0;
  const errs = by.ERROR ?? 0;
  const evaluated = N - errs; // 成功从 eBay 拿到裁定语义的
  // ACES 判定: listing 有 ACES = 不是 11505。分母用 evaluated 里能判 ACES 有无的
  const acesKnown = main.filter((r) => r.outcome !== "ERROR" && r.outcome !== "OUR_VCDB_UNRESOLVED");
  const hasAces = acesKnown.filter((r) => r.listingHasAces).length;

  // 归一化失败按 make
  const needAlign = main.filter((r) => r.listingHasAces && (r.outcome === "UND_OUR_NORMALIZE_FAIL" || r.pairs > 0 || r.outcome === "OUR_VCDB_UNRESOLVED"));
  const failByMake: Record<string, { total: number; fail: number }> = {};
  for (const r of needAlign) {
    const m = (failByMake[r.make] ??= { total: 0, fail: 0 });
    m.total++;
    if (r.outcome === "UND_OUR_NORMALIZE_FAIL" || r.outcome === "OUR_VCDB_UNRESOLVED") m.fail++;
  }
  const makeRows = Object.entries(failByMake).filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].fail / b[1].total) - (a[1].fail / a[1].total))
    .map(([mk, v]) => `| ${mk} | ${v.total} | ${v.fail} | ${pct(v.fail, v.total)} |`).join("\n");

  // 第 5 栏
  const c5 = col5.length;
  const c5by = tally(col5, (r) => r.outcome);
  const c5comp = c5by.COMPATIBLE ?? 0;
  const c5contra = c5by.NOT_COMPATIBLE ?? 0;
  const c5decided = c5comp + c5contra;
  const c5noaces = c5by.UND_LISTING_NO_ACES ?? 0;

  return `# checkCompatibility 覆盖率测量报告 (spike)

> 只测量, 未改 pipeline / service / 判定逻辑, 未接线上。数据: \`${COMPAT_SAMPLE.replace(SVC, "…")}\` (主) + matcher 输出 (第 5 栏)。
> 方法: **base-first** —— 先只用 Year/Make/Model 调 checkCompatibility; 仅当返回 11504 (缺 Trim/Engine, 说明 listing 有 ACES) 才用 VCdb 归一化 + Taxonomy 对齐出 Trim/Engine 重试。11505 = listing 没挂 ACES。
> 复用 \`ebay-align.ts\` (getCompatibilityPropertyValues / alignModel / alignTrim / alignEngine) + \`vcdb-config.ts\` (resolveVehicleConfig / formatVehicleForEbay), 未改这两个文件。

## 核心三个数

| 指标 | 值 |
|---|---|
| **① 覆盖率 (可用裁定率)** | **${pct(usable, evaluated)}** (COMPATIBLE+NOT_COMPATIBLE = ${usable} / 有效 ${evaluated}) |
| **① UNDETERMINED 率** | ${pct(undLans + undOur + undAmb, evaluated)} (${undLans + undOur + undAmb} / ${evaluated}) |
| **① listing 有 ACES 率** (验证"约 77%") | **${pct(hasAces, acesKnown.length)}** (${hasAces} / ${acesKnown.length} 可判 ACES 有无的) |
| **② UNDETERMINED 拆因 · listing 没 ACES** | ${undLans} (${pct(undLans, N)}) |
| **② UNDETERMINED 拆因 · 我方没归一化出 Trim/Engine** | ${undOur + vcdbUnres} (${pct(undOur + vcdbUnres, N)})  [其中 VCdb 都对不上 ${vcdbUnres}] |
| **② UNDETERMINED 拆因 · 供了完整 Trim/Engine 仍未定** | ${undAmb} (${pct(undAmb, N)}) |
| **③ 归一化失败率** (需对齐的样本里) | 见下表 |

## ① 覆盖率明细 (N=${N})

| outcome | 数量 | 占比 |
|---|---:|---:|
| COMPATIBLE (可用) | ${by.COMPATIBLE ?? 0} | ${pct(by.COMPATIBLE ?? 0, N)} |
| NOT_COMPATIBLE (可用) | ${by.NOT_COMPATIBLE ?? 0} | ${pct(by.NOT_COMPATIBLE ?? 0, N)} |
| UNDETERMINED · listing 没 ACES (11505) | ${undLans} | ${pct(undLans, N)} |
| UNDETERMINED · 我方归一化失败 (11504 无对) | ${undOur} | ${pct(undOur, N)} |
| UNDETERMINED · 供全属性仍未定 | ${undAmb} | ${pct(undAmb, N)} |
| 我方 VCdb 对不上 (归一化失败) | ${vcdbUnres} | ${pct(vcdbUnres, N)} |
| eBay 调用异常 | ${errs} | ${pct(errs, N)} |

**解读**: "覆盖率"= 在 eBay 能返回语义的 ${evaluated} 条里, 有 ${pct(usable, evaluated)} 拿到可用裁定 (COMPATIBLE/NOT_COMPATIBLE)。listing 有 ACES 率 ${pct(hasAces, acesKnown.length)} —— 用来对照"约 77% 有 ACES"的说法。

## ② UNDETERMINED 到底赖谁

- **listing 侧 (没挂 ACES, 11505)**: ${undLans} 条 —— 这批无论我方怎么归一化都判不了, 只能靠别的信号 (标题/兼容文本)。
- **我方侧 (没归一化出 Trim/Engine)**: ${undOur + vcdbUnres} 条 (含 VCdb 都对不上 ${vcdbUnres}) —— listing 有 ACES、eBay 明确要 Trim/Engine, 但我方没对齐出来。**这批正是"给候选补结构化适配"能救回的**。
- **供全属性仍未定**: ${undAmb} 条 —— 供了完整 Trim/Engine 还是 UNDETERMINED, 多半 listing 自己的 ACES 不全。

## ③ 归一化失败率 (按 make, 需对齐样本 ≥3 条的)

| make | 需对齐 | 失败 | 失败率 |
|---|---:|---:|---:|
${makeRows || "| (样本不足) | | | |"}

Taxonomy 非 200 次数 (可能限流, 会被误记成对齐失败): ${taxNon200}

## ⑤ MPN 命中批: confirm vs contradict (col5 N=${c5})

在"我方有 part_number 且 EXACT_MPN_MATCH"的候选上跑 checkCompatibility:

| 结果 | 数量 | 占比 |
|---|---:|---:|
| COMPATIBLE (号命中且确实适配) | ${c5comp} | ${pct(c5comp, c5)} |
| NOT_COMPATIBLE (号命中但**其实不装这台车**) | ${c5contra} | ${pct(c5contra, c5)} |
| listing 没 ACES (无法核) | ${c5noaces} | ${pct(c5noaces, c5)} |
| 其它 (未定/异常/归一化失败) | ${c5 - c5comp - c5contra - c5noaces} | ${pct(c5 - c5comp - c5contra - c5noaces, c5)} |

**关键数**: 在能裁定的 ${c5decided} 个 MPN 命中里, **${pct(c5contra, c5decided)} 是 NOT_COMPATIBLE** —— 即"号对上了但不装这台车"。这直接量出给 MPN 命中补一道 checkCompatibility 校验的价值。

---
_生成: 主样本 ${N} 条 + col5 ${c5} 条; MAX_PAIRS=${MAX_PAIRS}, MAX_VCDB=${MAX_VCDB}。逐条明细见 ${OUT_CSV}。_
`;
}

function toCsv(main: Row[], col5: Col5Row[]): string {
  const head = "set,itemId,category,year,make,model,partNumber,outcome,base_status,final_status,errorIds,vcdbResolved,modelMatched,trimMatched,engineMatched,pairs,listingHasAces";
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const line = (set: string, r: any) => [set, r.itemId, r.category ?? "", r.year, r.make, r.model, r.partNumber ?? "",
    r.outcome, r.base_status, r.final_status, r.errorIds, r.vcdbResolved, r.modelMatched, r.trimMatched, r.engineMatched, r.pairs, r.listingHasAces].map(esc).join(",");
  return [head, ...main.map((r) => line("main", r)), ...col5.map((r) => line("col5", r))].join("\n");
}

// 从已写出的 CSV 复用 main 行 (MAIN_N=0 时用, 免得重跑 400 条主样本)
function loadMainFromCsv(): Row[] {
  if (!fs.existsSync(OUT_CSV)) throw new Error(`MAIN_N=0 但找不到 ${OUT_CSV} 可复用`);
  const lines = fs.readFileSync(OUT_CSV, "utf8").trim().split("\n");
  const head = lines[0].split(",");
  const idx = (n: string) => head.indexOf(n);
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.match(/("(?:[^"]|"")*"|[^,]*)/g)!.filter((_, i) => i % 2 === 0)
      .map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
    if (cells[idx("set")] !== "main") continue;
    rows.push({
      itemId: cells[idx("itemId")], category: cells[idx("category")],
      year: cells[idx("year")], make: cells[idx("make")], model: cells[idx("model")],
      outcome: cells[idx("outcome")] as Outcome, base_status: cells[idx("base_status")],
      final_status: cells[idx("final_status")], errorIds: cells[idx("errorIds")],
      vcdbResolved: cells[idx("vcdbResolved")] === "true", modelMatched: cells[idx("modelMatched")] === "true",
      trimMatched: cells[idx("trimMatched")] === "true", engineMatched: cells[idx("engineMatched")] === "true",
      pairs: Number(cells[idx("pairs")] || 0), listingHasAces: cells[idx("listingHasAces")] === "true",
    });
  }
  return rows;
}

async function main() {
  const token = await getEbayToken();
  const mainRows = MAIN_N === 0 ? loadMainFromCsv() : await runMain(token);
  if (MAIN_N === 0) console.error(`[main] 复用 ${mainRows.length} 条 (从 ${OUT_CSV})`);
  const col5Rows = await runCol5(token);
  fs.writeFileSync(OUT_MD, buildReport(mainRows, col5Rows));
  fs.writeFileSync(OUT_CSV, toCsv(mainRows, col5Rows));
  console.error(`\n✔ 写出 ${OUT_MD} + ${OUT_CSV}`);
  console.log(buildReport(mainRows, col5Rows));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
