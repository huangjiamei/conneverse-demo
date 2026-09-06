/**
 * Phase 1 · checkCompatibility 适配闸 —— **影子跑** (只打标记, 不真删)。
 * 规格见 docs/phase1_checkCompatibility_gate.md。
 *
 * 范围: 只对 label=1 候选 (会进 optimizer 的那批) 用车调 checkCompatibility。
 * 硬规则 (只做减法):
 *   NOT_COMPATIBLE → 本规则"会筛掉"    (would_filter=true)
 *   COMPATIBLE     → 保留
 *   UNDETERMINED   → 保留 (判不了 ≠ 不装, 不误杀没挂 ACES 的 ~22%)
 * 绝不用 COMPATIBLE 复活 label=0/None。
 *
 * base-first: 先只 Year/Make/Model 调一次; 仅当 11504 (listing 有 ACES 缺 Trim/Engine)
 * 才 getItem(PRODUCT) 取 categoryId + VCdb 归一化 + Taxonomy 对齐出 Trim/Engine 重试。
 * (categoryId 直接读 getItem PRODUCT 响应, 不改 getItem, 不用 COMPACT。)
 *
 * 运行 (默认 node v18 挂 Prisma, 用 nvm v24; eBay 凭据来自 matcher/.env):
 *   NODE24=~/.nvm/versions/node/v24.14.0/bin/node
 *   set -a; . ../conneverse-part-matcher/.env; set +a
 *   $NODE24 --import tsx scripts/phase1-compat-gate-shadow.ts [N]
 *
 * 输出: docs/phase1-compat-gate-shadow.md + docs/phase1-compat-gate-rows.csv
 */
import fs from "fs";
import { prisma } from "../src/lib/prisma";
import {
  getEbayToken, alignModel, alignTrim, alignEngine,
} from "../src/lib/vehicle/ebay-align";
import { resolveVehicleConfig, formatVehicleForEbay } from "../src/lib/vehicle/vcdb-config";

const SVC = process.env.SERVICE_DIR ?? "/Users/huangjiamei/Cursor/conneverse/backend/service";
const DATASET = process.env.DATASET ?? `${SVC}/V4/test_dataset_v4.json`;
const N = Number(process.argv[2] || 400);
const MAX_PAIRS = 6, MAX_VCDB = 6, THROTTLE_MS = 120;
const OUT_MD = "docs/phase1-compat-gate-shadow.md";
const OUT_CSV = "docs/phase1-compat-gate-rows.csv";

// matcher 4 字符 make 缩写 → 全名
const MAKE: Record<string, string> = {
  FORD: "Ford", HOND: "Honda", KIA: "Kia", TOYO: "Toyota", CHEV: "Chevrolet", SUBA: "Subaru",
  JEEP: "Jeep", GMC: "GMC", RAM: "Ram", BENZ: "Mercedes-Benz", HYUN: "Hyundai", NISS: "Nissan",
  TESL: "Tesla", MAZD: "Mazda", VOLK: "Volkswagen", DODG: "Dodge", CHRY: "Chrysler", BUIC: "Buick",
  CADI: "Cadillac", LEXS: "Lexus", INFI: "Infiniti", ACUR: "Acura", VOLV: "Volvo", AUDI: "Audi",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const expandMake = (m: string) => MAKE[String(m || "").toUpperCase()] ?? m;

let taxNon200 = 0;
async function taxVals(categoryId: string, prop: "Model" | "Trim" | "Engine", filter: Record<string, string>, token: string): Promise<string[]> {
  const f = Object.entries(filter).map(([k, v]) => `${k}:${v}`).join(",");
  const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/100/get_compatibility_property_values?category_id=${categoryId}&compatibility_property=${prop}&filter=${encodeURIComponent(f)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { taxNon200++; return []; }
  const j = await r.json();
  return (j.compatibilityPropertyValues ?? []).map((v: { value: string }) => v.value);
}

type CompatResult = { status: string; errorIds: number[]; httpOk: boolean };
async function checkCompat(token: string, itemId: string, props: Record<string, string>): Promise<CompatResult> {
  const compatibilityProperties = Object.entries(props).filter(([, v]) => v && String(v).trim()).map(([name, value]) => ({ name, value }));
  const r = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(itemId)}/check_compatibility`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-EBAY-C-MARKETPLACE-ID": "EBAY_US", "Content-Language": "en-US" },
    body: JSON.stringify({ compatibilityProperties }),
  });
  const j: any = await r.json().catch(() => ({}));
  const errorIds = [...(j.warnings ?? []), ...(j.errors ?? [])].map((e: any) => e.errorId).filter((x: any) => typeof x === "number");
  if (!r.ok) return { status: `ERR_${r.status}`, errorIds, httpOk: false };
  return { status: j.compatibilityStatus || "UNDETERMINED", errorIds, httpOk: true };
}

// getItem(PRODUCT) → categoryId (规格要求: 读现有 PRODUCT 响应, 不用 COMPACT)
async function getItemCategoryId(token: string, itemId: string): Promise<string | null> {
  const gi: any = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(itemId)}?fieldgroups=PRODUCT`, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  }).then((r) => r.json()).catch(() => ({}));
  return gi?.categoryId ?? null;
}

async function resolveVcdb(year: number, make: string, model: string): Promise<{ id: number; model: string }[]> {
  return prisma.$queryRawUnsafe<{ id: number; model: string }[]>(
    `SELECT v.id, md.name AS model FROM "VcdbVehicle" v
     JOIN "VcdbBaseVehicle" bv ON bv.id=v."baseVehicleId"
     JOIN "VcdbMake" mk ON mk.id=bv."makeId"
     JOIN "VcdbModel" md ON md.id=bv."modelId"
     WHERE bv."yearId"=$1 AND lower(mk.name)=lower($2)
       AND (lower(md.name)=lower($3) OR lower(md.name) LIKE lower($3)||' %' OR lower(md.name) LIKE '%'||lower($3)||'%')
     ORDER BY (lower(md.name)=lower($3)) DESC, length(md.name) ASC LIMIT 8`,
    year, make, model);
}
type Engine = { liter: string | null; cid: string | null; cylinders: string | null; blockType: string | null; fuelType: string; label: string };
type OurAgg = { model: string; submodels: string[]; engines: Engine[] };
const vcdbCache = new Map<string, OurAgg | null>();
async function normalizeVehicle(year: number, make: string, model: string): Promise<OurAgg | null> {
  const key = `${year}|${make}|${model}`;
  if (vcdbCache.has(key)) return vcdbCache.get(key)!;
  const rows = await resolveVcdb(year, make, model);
  if (!rows.length) { vcdbCache.set(key, null); return null; }
  const fullModel = rows[0].model;
  const submodels = new Set<string>(); const engines = new Map<string, Engine>();
  for (const row of rows.filter((r) => r.model === fullModel).slice(0, MAX_VCDB)) {
    const cfg = await resolveVehicleConfig({ vehicleId: row.id });
    if (!cfg) continue;
    const ev = formatVehicleForEbay(cfg);
    if (ev.trim) submodels.add(ev.trim);
    for (const e of ev.engines) if (e.label) engines.set(e.label, e as Engine);
  }
  const agg = { model: fullModel, submodels: [...submodels], engines: [...engines.values()] };
  vcdbCache.set(key, agg); return agg;
}

type Align = { ebayModel: string | null; trimMatched: boolean; engineMatched: boolean; pairs: { trim: string; engine: string }[] };
const alignCache = new Map<string, Align>();
async function alignAll(categoryId: string, year: string, make: string, agg: OurAgg, token: string): Promise<Align> {
  const key = `${categoryId}|${year}|${make}|${agg.model}`;
  if (alignCache.has(key)) return alignCache.get(key)!;
  const base = { Year: year, Make: make };
  const ebayModels = await taxVals(categoryId, "Model", base, token);
  const aligned = alignModel(agg.model, ebayModels);       // 我方 model → eBay Model 词表值 (对不上 = null)
  const filter = { ...base, Model: aligned ?? agg.model };
  const [ebayTrims, ebayEngines] = await Promise.all([taxVals(categoryId, "Trim", filter, token), taxVals(categoryId, "Engine", filter, token)]);
  const trims = [...new Set(agg.submodels.flatMap((sm) => alignTrim(sm, ebayTrims)))];
  const engSet = [...new Set(agg.engines.map((e) => alignEngine(e, ebayEngines)).flat())];
  const pairs: { trim: string; engine: string }[] = [];
  for (const t of trims) for (const ev of engSet) pairs.push({ trim: t, engine: ev });
  const al = { ebayModel: aligned, trimMatched: trims.length > 0, engineMatched: engSet.length > 0, pairs };
  alignCache.set(key, al); return al;
}

type Verdict = "COMPATIBLE" | "NOT_COMPATIBLE" | "UNDETERMINED";
type Row = {
  itemId: string; year: string; make: string; model: string; title: string; source: string;
  compat_verdict: Verdict; would_filter: boolean; detail: string;
};

async function evaluate(token: string, itemId: string, year: string, make: string, model: string, title: string, source: string): Promise<Row> {
  const base: Row = { itemId, year, make, model, title, source, compat_verdict: "UNDETERMINED", would_filter: false, detail: "" };
  // base-first: 只信 COMPATIBLE (raw model 就命中 ACES = 安全) 和 11505 (没挂 ACES)。
  // ⚠️ 绝不直接信 base 的 NOT_COMPATIBLE —— model_guess 常不在 eBay Model 词表 (如 C-Class≠C300),
  //    这种 NOT 是"词表没这个值"的假阴性, 会误杀好候选。必须先把 model 对齐进 eBay 词表再判。
  const b = await checkCompat(token, itemId, { Year: year, Make: make, Model: model });
  if (b.status === "COMPATIBLE") return { ...base, compat_verdict: "COMPATIBLE", detail: "ymm_compat" };
  if (b.errorIds.includes(11505)) return { ...base, detail: "listing_no_aces" };              // 保留

  // 归一化 + 对齐 (校验 model 在 eBay 词表内, 并尽量对出 Trim/Engine)
  const agg = await normalizeVehicle(Number(year), make, model);
  if (!agg) return { ...base, detail: "our_vcdb_unresolved" };                                 // 保留 (fail-open)
  const categoryId = await getItemCategoryId(token, itemId);
  if (!categoryId) return { ...base, detail: "no_categoryId" };                                // 保留
  const al = await alignAll(categoryId, year, make, agg, token);
  if (!al.ebayModel) return { ...base, detail: "model_not_in_ebay" };                          // 保留: model 不在词表, NOT 不可信
  const M = al.ebayModel;

  if (al.pairs.length) {
    // model 在词表 + 有 (Trim,Engine): 逐对判, 命中 COMPATIBLE 即保留; 全 NOT 才筛
    let sawNot = false;
    for (const p of al.pairs.slice(0, MAX_PAIRS)) {
      const res = await checkCompat(token, itemId, { Year: year, Make: make, Model: M, Trim: p.trim, Engine: p.engine });
      if (res.status === "COMPATIBLE") return { ...base, compat_verdict: "COMPATIBLE", detail: "aligned_compat" };
      if (res.status === "NOT_COMPATIBLE") sawNot = true;
    }
    if (sawNot) return { ...base, compat_verdict: "NOT_COMPATIBLE", would_filter: true, detail: "aligned_not" };
    return { ...base, detail: "aligned_und" };                                                 // 保留
  }
  // model 在词表但没对出 Trim/Engine: 用对齐后的 model 单独判
  const res = await checkCompat(token, itemId, { Year: year, Make: make, Model: M });
  if (res.status === "COMPATIBLE") return { ...base, compat_verdict: "COMPATIBLE", detail: "model_only_compat" };
  if (res.status === "NOT_COMPATIBLE") return { ...base, compat_verdict: "NOT_COMPATIBLE", would_filter: true, detail: "model_only_not" };
  return { ...base, detail: "model_only_und" };                                                // 保留 (含 11504: 有 ACES 缺 trim/engine, 判不了)
}

// 按 make 分层抽样
function stratify<T>(items: T[], keyOf: (t: T) => string, n: number): T[] {
  if (items.length <= n) return items;
  const g = new Map<string, T[]>();
  for (const it of items) { const k = keyOf(it); (g.get(k) ?? g.set(k, []).get(k)!).push(it); }
  const keys = [...g.keys()]; const out: T[] = []; let i = 0;
  while (out.length < n && i <= items.length * 2) {
    const arr = g.get(keys[i % keys.length])!; const idx = Math.floor(i / keys.length);
    if (idx < arr.length) out.push(arr[idx]); i++;
  }
  return out.slice(0, n);
}

function pct(n: number, d: number) { return d ? `${((n / d) * 100).toFixed(1)}%` : "—"; }

async function main() {
  const token = await getEbayToken();
  // 收集 label=1 候选 (dedup by itemId)
  const seen = new Set<string>();
  const cands: { itemId: string; year: string; make: string; model: string; title: string; source: string }[] = [];
  for (const line of fs.readFileSync(DATASET, "utf8").trim().split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    const v = r.source_part_info?.vehicle ?? {};
    for (const c of r.candidate_info_list ?? []) {
      const iid = c.item_id ?? c.itemId;
      if (c.candidate_label === 1 && iid && !seen.has(iid)) {
        seen.add(iid);
        cands.push({ itemId: iid, year: String(v.year ?? ""), make: expandMake(v.make), model: String(v.model_guess ?? ""), title: c.title ?? "", source: c.candidate_label_source ?? "" });
      }
    }
  }
  const totalL1 = cands.length;
  const subset = stratify(cands, (c) => c.make, N);
  console.error(`[shadow] label=1 唯一候选 ${totalL1}; 抽样 ${subset.length} (按 make 分层)`);

  const rows: Row[] = [];
  let done = 0;
  for (const c of subset) {
    try { rows.push(await evaluate(token, c.itemId, c.year, c.make, c.model, c.title, c.source)); }
    catch (e) { rows.push({ ...c, compat_verdict: "UNDETERMINED", would_filter: false, detail: `EXC:${String(e).slice(0, 50)}` }); }
    if (++done % 25 === 0) console.error(`  …${done}/${subset.length}`);
    await sleep(THROTTLE_MS);
  }

  // ---- 汇总 ----
  const n = rows.length;
  const v = (x: Verdict) => rows.filter((r) => r.compat_verdict === x).length;
  const filtered = rows.filter((r) => r.would_filter);
  const detailTally: Record<string, number> = {};
  for (const r of rows) detailTally[r.detail] = (detailTally[r.detail] ?? 0) + 1;
  // 抽查明细: NOT_COMPATIBLE 前 20
  const check = filtered.slice(0, 20);

  const projFull = Math.round((filtered.length / n) * totalL1);
  const md = `# Phase 1 · checkCompatibility 适配闸 —— 影子报告 (未真删)

> 规格: docs/phase1_checkCompatibility_gate.md。**只打标记, 未从结果里删任何候选。**
> 范围: 只对 label=1 候选 (会进 optimizer 那批) 跑。数据源: \`${DATASET.replace(SVC, "…")}\` (全量 label=1 唯一候选 ${totalL1} 个, 本次抽样 ${n})。
> 规则: NOT_COMPATIBLE→筛掉; COMPATIBLE→保留; UNDETERMINED(含没挂 ACES/我方没归一化/异常)→保留 (fail-open, 判不了不误杀)。
> 复用 ebay-align.ts + vcdb-config.ts, getItem 仍用 PRODUCT (带 categoryId), 未改检索/判定逻辑。
> ⚠️ 本数据集 label=1 全部来自 MPN 硬匹配档 (EXACT_MPN_MATCH / TITLE_TOKEN / SUFFIX); n-gram 命中的 label=1 在此离线集里不存在, 上线时同一道闸对 n-gram 命中一并生效。

## 这道闸会筛掉多少 (核心)

| | 数量 | 占抽样 label=1 |
|---|---:|---:|
| **会被筛掉 (NOT_COMPATIBLE)** | **${filtered.length}** | **${pct(filtered.length, n)}** |
| 保留 · COMPATIBLE (适配确认) | ${v("COMPATIBLE")} | ${pct(v("COMPATIBLE"), n)} |
| 保留 · UNDETERMINED (判不了) | ${v("UNDETERMINED")} | ${pct(v("UNDETERMINED"), n)} |

**外推**: 按此比例, 全量 ${totalL1} 个 label=1 候选里约 **${projFull} 个**会被这道闸筛掉。

## 保留/筛掉的明细归因

| detail | 数量 | 占比 | 归类 |
|---|---:|---:|---|
${Object.entries(detailTally).sort((a, b) => b[1] - a[1]).map(([k, c]) => {
  const CLS: Record<string, string> = {
    aligned_not: "筛掉·对齐(model+trim/engine)后仍 NOT",
    model_only_not: "筛掉·model 在词表+年款不在 ACES → NOT (弱一点)",
    ymm_compat: "保留·raw Y/M/M 直接 COMPATIBLE",
    aligned_compat: "保留·对齐后 COMPATIBLE",
    model_only_compat: "保留·对齐 model 后 COMPATIBLE",
    listing_no_aces: "保留·listing 没挂 ACES (11505)",
    aligned_und: "保留·对齐后仍未定",
    model_only_und: "保留·有 ACES 缺 trim/engine 判不了",
    model_not_in_ebay: "保留·我方 model 不在 eBay 词表, NOT 不可信 (曾经的假阳性都落这)",
    our_vcdb_unresolved: "保留·VCdb 对不上 (fail-open)",
    no_categoryId: "保留·取不到 categoryId (fail-open)",
  };
  const cls = CLS[k] ?? (k.startsWith("err") || k.startsWith("EXC") ? "保留·异常 (fail-open)" : "");
  return `| ${k} | ${c} | ${pct(c, n)} | ${cls} |`;
}).join("\n")}

## 抽查: 会被筛掉的候选 (人工核 —— 是不是真不装, 防 eBay 误判)

${check.length ? `| # | itemId | 车辆 | 判定依据 | 标题 |
|---:|---|---|---|---|
${check.map((r, i) => `| ${i + 1} | ${r.itemId} | ${r.year} ${r.make} ${r.model} | ${r.detail} | ${r.title.slice(0, 60).replace(/\|/g, "/")} |`).join("\n")}` : "(本次抽样无 NOT_COMPATIBLE)"}

## 下一步

1. 人工核上表 15–20 条确认确实不装 (排除 eBay ACES 误判)。
2. 核验无误 → 再把"筛掉"真正生效 (Phase 2, 需决定落在 Python pipeline 还是 Node 层, 见对话)。
3. Taxonomy 非 200 次数 (可能限流→被记成保留): ${taxNon200}。

---
_抽样 ${n} / 全量 label=1 ${totalL1}; MAX_PAIRS=${MAX_PAIRS}, MAX_VCDB=${MAX_VCDB}。逐条见 ${OUT_CSV}。_
`;
  fs.writeFileSync(OUT_MD, md);
  const head = "itemId,year,make,model,source,compat_verdict,would_filter,detail,title";
  const esc = (x: any) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  fs.writeFileSync(OUT_CSV, [head, ...rows.map((r) => [r.itemId, r.year, r.make, r.model, r.source, r.compat_verdict, r.would_filter, r.detail, r.title].map(esc).join(","))].join("\n"));
  console.error(`✔ 写出 ${OUT_MD} + ${OUT_CSV}`);
  console.log(md);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
