/**
 * Smoke test for the eBay Browse API wrapper.
 *
 * Run from the project root:
 *   node --experimental-strip-types src/lib/test-ebay-search.ts
 */

import nextEnv from "@next/env";
import { searchEbayParts } from "./ebay-search.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

async function main() {
  const query = "brake pads 2022 Toyota Camry";
  console.log(`Searching eBay for: "${query}"\n`);

  const results = await searchEbayParts(query, { limit: 3 });

  if (results.length === 0) {
    console.log("No results.");
    return;
  }

  results.forEach((item, i) => {
    const condition = item.condition ?? "—";
    const seller = item.seller.username || "unknown";
    const feedback =
      item.seller.feedbackPercentage != null
        ? ` (${item.seller.feedbackPercentage}% pos)`
        : "";
    const shipping =
      item.shippingCost != null
        ? `$${item.shippingCost.toFixed(2)} shipping`
        : "shipping —";

    console.log(`${i + 1}. ${item.title}`);
    console.log(
      `   $${item.price.toFixed(2)} ${item.currency} · ${condition} · ${shipping}`
    );
    console.log(`   Seller: ${seller}${feedback}`);
    console.log(`   ${item.itemUrl}`);
    console.log();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
