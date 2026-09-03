/**
 * alignVehicleToEbay —— 把我们的车辆 (resolveVehicleConfig/formatVehicleForEbay 的结果)
 * 对齐到 eBay 精确目录值, 供 checkCompatibility 用。
 *
 * eBay 目录值来自 Commerce Taxonomy API 的 getCompatibilityPropertyValues:
 *   GET /commerce/taxonomy/v1/category_tree/100/get_compatibility_property_values
 *       ?category_id=&compatibility_property=Model|Trim|Engine&filter=Year:..,Make:..,Model:..
 *   (tree 100 = eBay Motors)
 *
 * 关键形态 (实测 2015 Silverado 1500):
 *   Trim   = "LS Crew Cab Pickup 4-Door"  (= SubModel + 车身, 我们的 submodel 要前缀匹配)
 *   Engine = "5.3L 5328CC 325Cu. In. V8 GAS OHV Naturally Aspirated"  (啰嗦串, 按 liter+缸数+燃料 匹配)
 *   Model  = "Silverado 1500"  (我们 VCdb 的 model 全名一般就等于 eBay Model)
 */

const TAX = "https://api.ebay.com/commerce/taxonomy/v1/category_tree/100";
const OAUTH = "https://api.ebay.com/identity/v1/oauth2/token";

// ---- app token (client_credentials) ----
let _tok = "", _exp = 0;
export async function getEbayToken(): Promise<string> {
  if (_tok && Date.now() < _exp) return _tok;
  const id = process.env.EBAY_CLIENT_ID, secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET missing");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch(OAUTH, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });
  if (!r.ok) throw new Error(`OAuth ${r.status}: ${await r.text()}`);
  const j = await r.json();
  _tok = j.access_token; _exp = Date.now() + (j.expires_in - 60) * 1000;
  return _tok;
}

/** 拉某个 (category, Year/Make/Model) 下, eBay 某个属性 (Model/Trim/Engine) 的合法值。 */
export async function getCompatibilityPropertyValues(
  categoryId: string,
  property: "Model" | "Trim" | "Engine",
  filter: Record<string, string>,
  token?: string
): Promise<string[]> {
  const tok = token ?? (await getEbayToken());
  const f = Object.entries(filter).map(([k, v]) => `${k}:${v}`).join(",");
  const url = `${TAX}/get_compatibility_property_values?category_id=${categoryId}&compatibility_property=${property}&filter=${encodeURIComponent(f)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.compatibilityPropertyValues ?? []).map((v: { value: string }) => v.value);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** 我们的 model 全名 → eBay Model 目录值 (精确/包含)。 */
export function alignModel(ourModel: string, ebayModels: string[]): string | null {
  const m = norm(ourModel);
  return (
    ebayModels.find((e) => norm(e) === m) ||
    ebayModels.find((e) => norm(e).startsWith(m + " ")) ||
    ebayModels.find((e) => norm(e).includes(m)) ||
    null
  );
}

/** submodel → eBay Trim 值 (eBay Trim = submodel + 车身, 所以前缀/包含匹配, 可能多条)。 */
export function alignTrim(submodel: string, ebayTrims: string[]): string[] {
  const sm = norm(submodel);
  const exact = ebayTrims.filter((t) => norm(t) === sm);
  if (exact.length) return exact;
  const pref = ebayTrims.filter((t) => norm(t).startsWith(sm + " "));
  if (pref.length) return pref;
  const tok = ebayTrims.filter((t) => norm(t).split(" ").includes(sm));
  return tok;
}

/** 我们的 engine (liter/cylinders/blockType/fuelType) → eBay Engine 目录值。
 *  按 liter + 缸数(V8) + 燃料 匹配, 容忍 CC/CID/OHV/aspiration 等其余分量。 */
export function alignEngine(
  eng: { liter: string | null; cylinders: string | null; blockType: string | null; fuelType: string },
  ebayEngines: string[]
): string[] {
  const lit = eng.liter ? eng.liter.toLowerCase() + "l" : null; // "5.3l"
  const vc = eng.blockType && eng.cylinders ? (eng.blockType + eng.cylinders).toLowerCase() : null; // "v8"
  const fuel = eng.fuelType ? eng.fuelType.toLowerCase() : null; // "gas"/"flex"
  return ebayEngines.filter((e) => {
    const s = e.toLowerCase();
    if (lit && !s.includes(lit)) return false;
    if (fuel && !s.includes(fuel)) return false;
    if (vc && !s.includes(vc)) return false;
    return true;
  });
}

export type OurVehicle = {
  year: string;
  make: string;
  model: string;
  trim: string; // SubModel
  engines: { liter: string | null; cid: string | null; cylinders: string | null; blockType: string | null; fuelType: string; label: string }[];
};

export type AlignResult = {
  categoryId: string;
  year: string;
  make: string;
  model: { our: string; ebay: string | null; matched: boolean };
  trims: string[];              // 对齐到的 eBay Trim 值 (该 submodel 下所有车身变体)
  engines: { our: string; ebay: string[] }[]; // 每个我们的 engine → 对齐到的 eBay engine 值
  unmatched: { model: boolean; trim: boolean; engines: string[] };
  // 供 checkCompatibility 用的精确 (Trim, Engine) 候选对
  pairs: { trim: string; engine: string }[];
};

/** 对齐一台车 (ourVehicle) 到 eBay 精确目录。对不上的标 UNMATCHED。 */
export async function alignVehicleToEbay(
  categoryId: string,
  our: OurVehicle,
  token?: string
): Promise<AlignResult> {
  const tok = token ?? (await getEbayToken());
  const baseFilter = { Year: our.year, Make: our.make };

  // 1. Model 对齐
  const ebayModels = await getCompatibilityPropertyValues(categoryId, "Model", baseFilter, tok);
  const alignedModel = alignModel(our.model, ebayModels);
  const model = alignedModel ?? our.model; // 对不上就用原名去试 (可能 eBay 直接认)

  // 2. Trim / Engine 目录值 (按对齐后的 Model)
  const filter = { ...baseFilter, Model: model };
  const [ebayTrims, ebayEngines] = await Promise.all([
    getCompatibilityPropertyValues(categoryId, "Trim", filter, tok),
    getCompatibilityPropertyValues(categoryId, "Engine", filter, tok),
  ]);

  const trims = alignTrim(our.trim, ebayTrims);
  const engines = our.engines.map((e) => ({ our: e.label, ebay: alignEngine(e, ebayEngines) }));

  const pairs: { trim: string; engine: string }[] = [];
  for (const t of trims) for (const e of engines) for (const ev of e.ebay) pairs.push({ trim: t, engine: ev });

  return {
    categoryId, year: our.year, make: our.make,
    model: { our: our.model, ebay: alignedModel, matched: alignedModel != null },
    trims,
    engines,
    unmatched: {
      model: alignedModel == null,
      trim: trims.length === 0,
      engines: engines.filter((e) => e.ebay.length === 0).map((e) => e.our),
    },
    pairs,
  };
}
