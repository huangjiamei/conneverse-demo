/**
 * Probe eBay to find a category ID that accepts compatibility_filter
 * for "brake pads, 2022 Toyota Camry".
 *
 * Run: node --experimental-strip-types src/lib/test-ebay-compat-cats.ts
 */

import nextEnv from "@next/env";
import { getEbayAccessToken } from "./ebay-auth.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const BASE = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const COMPAT = "Year:2022;Make:Toyota;Model:Camry";

// Candidate category IDs:
//   6028  — Auto Parts & Accessories (top-level US)
//   33559 — Auto Parts & Accessories (parent on some listings)
//   33707 — Car & Truck Brakes & Brake Parts
//   33567 — Brake Pads & Shoes
//   no-cat — try without category at all
const CANDIDATES: (string | null)[] = [
  null,
  "6028",
  "33559",
  "33707",
  "33567",
  "33621",
  "33636",
  "9355",
  "6000",
  "6030",
];

async function main() {
  const token = await getEbayAccessToken();

  for (const cat of CANDIDATES) {
    const params = new URLSearchParams({
      q: "brake pads",
      limit: "1",
      compatibility_filter: COMPAT,
    });
    if (cat) params.set("category_ids", cat);

    const res = await fetch(`${BASE}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        Accept: "application/json",
      },
    });

    const body = await res.text();
    let summary: string;
    if (res.ok) {
      try {
        const data = JSON.parse(body);
        const n = data.itemSummaries?.length ?? 0;
        const total = data.total ?? "?";
        const first = data.itemSummaries?.[0]?.title?.slice(0, 50) ?? "—";
        summary = `OK · returned ${n} / total=${total} · "${first}…"`;
      } catch {
        summary = `OK · (unparsed body)`;
      }
    } else {
      try {
        const data = JSON.parse(body);
        summary = `${res.status} · ${data.errors?.[0]?.message ?? body.slice(0, 80)}`;
      } catch {
        summary = `${res.status} · ${body.slice(0, 80)}`;
      }
    }
    console.log(`[cat=${cat ?? "(none)"}] ${summary}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
