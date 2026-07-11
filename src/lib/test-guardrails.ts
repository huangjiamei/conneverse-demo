/**
 * Guardrail smoke test — synthetic tricky listings prove each of the
 * six filters fires. Run:
 *   node --experimental-strip-types src/lib/test-guardrails.ts
 */

import { applyEbayGuardrails } from "./guardrails.ts";
import type { EbayItem } from "./ebay-search.ts";

function item(partial: Partial<EbayItem>): EbayItem {
  return {
    itemId: "v1|123456789012|0",
    title: "Front Brake Pad Set for Toyota Camry 2018-2024",
    price: 40,
    currency: "USD",
    imageUrl: null,
    condition: "New",
    seller: { username: "seller1", feedbackPercentage: 99, feedbackScore: 1000 },
    itemUrl: "https://ebay.com/itm/1",
    shippingCost: 0,
    shippingType: "FIXED",
    minDeliveryDate: null,
    maxDeliveryDate: null,
    location: "US",
    ...partial,
  };
}

const ctx = {
  partName: "Front Brake Pad Set",
  category: "Brakes",
  vehicle: { year: 2022, make: "Toyota", model: "Camry" },
};

const cases: Array<{ label: string; item: EbayItem }> = [
  { label: "clean brake pad set", item: item({}) },
  { label: "junk price ($0.99)", item: item({ price: 0.99 }) },
  { label: "placeholder part #", item: item({ itemId: "~x" }) },
  {
    label: "universal accessory",
    item: item({ title: "Universal Fit Performance Brake Pad Cover Styling" }),
  },
  {
    label: "wrong part type (wiper for a brake search)",
    item: item({ title: "Windshield Wiper Blades for Toyota Camry" }),
  },
  {
    label: "wrong platform (F-250 on an F-150-style check)",
    item: item({ title: "Brake Pads for Ford F-250 Super Duty" }),
  },
  { label: "used condition", item: item({ condition: "Used" }) },
  {
    label: "genuine 4-pack (kit normalize)",
    item: item({ title: "Brake Pad Set 4-pack bulk for Toyota Camry", price: 160 }),
  },
];

const platformCtx = { ...ctx, vehicle: { year: 2021, make: "Ford", model: "F-150" } };

for (const c of cases) {
  const useCtx = c.label.includes("F-250") ? platformCtx : ctx;
  const { passed, rejected } = applyEbayGuardrails([c.item], useCtx);
  if (rejected.length > 0) {
    console.log(`REJECT  ${c.label.padEnd(45)} → ${rejected[0].reason} (${rejected[0].detail})`);
  } else {
    const p = passed[0];
    console.log(
      `PASS    ${c.label.padEnd(45)} → qty=${p.qtyIncluded} unit=$${p.unitPrice.toFixed(2)}`
    );
  }
}
