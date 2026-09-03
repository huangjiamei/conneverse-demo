/**
 * 重测 compat 样本: 车辆归一化(→VCdb→eBay精确目录)后重跑 checkCompatibility。
 *
 * 每条: sample Y/M/M → VCdb 车 (拿全名 model + submodel + engines)
 *      → alignVehicleToEbay(categoryId) → 精确 (Trim, Engine) 对
 *      → checkCompatibility 试各对, 任一 COMPATIBLE 即判该件适配此车型。
 *
 * 需要: 本地 Postgres (VCdb 配置层) + eBay 凭据 (EBAY_CLIENT_ID/SECRET, 用 matcher/.env)。
 * 用法: node --import tsx scripts/retest-compat.ts [N]
 */
import { prisma } from "../src/lib/prisma";
import { resolveVehicleConfig, formatVehicleForEbay } from "../src/lib/vehicle/vcdb-config";
import { alignVehicleToEbay, getEbayToken } from "../src/lib/vehicle/ebay-align";
import fs from "fs";

const SAMPLE = "/Users/huangjiamei/Cursor/conneverse/backend/service/V4/compat_sample.jsonl";
const N = Number(process.argv[2] || 40);
const MAX_PAIRS = 12; // 每件最多试的 (trim,engine) 对

type Item = { itemId: string; category: string; categoryId: string; title: string; vehicle: { year: string; make: string; model: string } };

// sample Y/M/M(guess) → VCdb: 返回该车型的全名 model + 各 vehicleId(按 submodel)
async function resolveVcdb(v: Item["vehicle"]) {
  const year = Number(v.year);
  const rows = await prisma.$queryRawUnsafe<{ id: number; model: string }[]>(
    `SELECT v.id, md.name AS model
     FROM "VcdbVehicle" v
     JOIN "VcdbBaseVehicle" bv ON bv.id=v."baseVehicleId"
     JOIN "VcdbMake" mk ON mk.id=bv."makeId"
     JOIN "VcdbModel" md ON md.id=bv."modelId"
     WHERE bv."yearId"=$1 AND lower(mk.name)=lower($2)
       AND (lower(md.name)=lower($3) OR lower(md.name) LIKE lower($3)||' %' OR lower(md.name) LIKE '%'||lower($3)||'%')
     ORDER BY (lower(md.name)=lower($3)) DESC, length(md.name) ASC
     LIMIT 8`,
    year, v.make, v.model
  );
  return rows;
}

async function checkCompat(token: string, itemId: string, props: Record<string, string>): Promise<string> {
  const body = { compatibilityProperties: Object.entries(props).map(([name, value]) => ({ name, value })) };
  const r = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(itemId)}/check_compatibility`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    return t.includes("11505") ? "NO_ACES" : `ERR_${r.status}`;
  }
  const j = await r.json();
  return j.compatibilityStatus || "UNDETERMINED";
}

async function main() {
  const token = await getEbayToken();
  const items: Item[] = fs.readFileSync(SAMPLE, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  // 取子集: 跨品类抽 N 条
  const subset = items.slice(0, N);

  const tally: Record<string, number> = {};
  const bump = (k: string) => (tally[k] = (tally[k] || 0) + 1);
  const compatSamples: string[] = [];
  const notCompatSamples: string[] = [];

  let done = 0;
  for (const it of subset) {
    done++;
    const vc = await resolveVcdb(it.vehicle);
    if (!vc.length) { bump("VCDB_UNRESOLVED"); continue; }

    // 用第一个匹配车型的第一辆车拿 engines + 全名 model; 用它对齐
    const cfg = await resolveVehicleConfig({ vehicleId: vc[0].id });
    if (!cfg) { bump("VCDB_UNRESOLVED"); continue; }
    const our = formatVehicleForEbay(cfg);

    let align;
    try { align = await alignVehicleToEbay(it.categoryId, our, token); }
    catch { bump("ALIGN_ERROR"); continue; }

    if (align.trims.length === 0 && align.engines.every((e) => e.ebay.length === 0)) {
      // eBay 对该 (category,Y/M/M) 无 Trim/Engine 目录 → 多半类目不支持 compat 或 model 未识别
      bump("NO_EBAY_CATALOG"); continue;
    }

    // 试各 (trim, engine) 对, 早停于 COMPATIBLE
    const pairs = align.pairs.slice(0, MAX_PAIRS);
    if (pairs.length === 0) { bump("UNMATCHED"); continue; }
    let best = "UNDETERMINED";
    for (const p of pairs) {
      const st = await checkCompat(token, it.itemId, {
        Year: our.year, Make: our.make, Model: align.model.ebay ?? our.model, Trim: p.trim, Engine: p.engine,
      });
      if (st === "COMPATIBLE") { best = "COMPATIBLE"; break; }
      if (st === "NO_ACES") { best = "NO_ACES"; break; }
      if (st === "NOT_COMPATIBLE") best = "NOT_COMPATIBLE";
    }
    bump(best);
    if (best === "COMPATIBLE" && compatSamples.length < 6)
      compatSamples.push(`[${our.year} ${our.make} ${align.model.ebay}] ${it.title.slice(0, 70)}`);
    if (best === "NOT_COMPATIBLE" && notCompatSamples.length < 6)
      notCompatSamples.push(`[${our.year} ${our.make} ${align.model.ebay}] ${it.title.slice(0, 70)}`);
    if (done % 10 === 0) console.error(`  …${done}/${subset.length}`);
  }

  console.log("\n=== 重测结果 (N=" + subset.length + ") ===");
  const order = ["COMPATIBLE", "NOT_COMPATIBLE", "UNDETERMINED", "NO_ACES", "NO_EBAY_CATALOG", "VCDB_UNRESOLVED", "UNMATCHED", "ALIGN_ERROR"];
  for (const k of order) if (tally[k]) console.log(`  ${k.padEnd(16)} ${tally[k]}  ${(tally[k] / subset.length * 100).toFixed(1)}%`);
  const decided = (tally.COMPATIBLE || 0) + (tally.NOT_COMPATIBLE || 0);
  console.log(`  --- 明确结论(COMPATIBLE+NOT_COMPATIBLE): ${decided} (${(decided / subset.length * 100).toFixed(1)}%)`);
  console.log("\n抽查 COMPATIBLE:"); compatSamples.forEach((s) => console.log("  " + s));
  console.log("抽查 NOT_COMPATIBLE:"); notCompatSamples.forEach((s) => console.log("  " + s));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
