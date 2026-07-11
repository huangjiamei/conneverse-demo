/**
 * Marketplace guardrails — hard filters that run on raw eBay listings
 * BEFORE any candidate reaches the optimizer (prime directive 5: never
 * show a confident wrong part). eBay's keyword + compatibility search is
 * noisy; these filters catch the traps it lets through.
 *
 * Per the QA Playbook, six checks:
 *   1. OE number-family consistency — the listing must plausibly be the
 *      resolved part type, not an unrelated part that shared a keyword.
 *   2. Platform/body-code — reject wrong-platform same-name listings
 *      (F-150 search returning an F-250 / Super Duty part).
 *   3. Accessory / universal / styling — reject "universal fit",
 *      "performance", "custom", "style" listings.
 *   4. Kit / multi-pack — detect "set of 4", "pair", "2pc" and normalize
 *      price to per-unit (qtyIncluded) so a pair is never compared to a
 *      single.
 *   5. Condition segmentation — used / refurbished are held out of the
 *      default new-parts comparison.
 *   6. Junk — <= $1 items and placeholder part numbers.
 *
 * Heuristic and demo-grade: with only Browse-search fields (title,
 * condition, price) available, checks 1/2/3 operate on the title. Full
 * `localizedAspects` (OE/MPN/brand from a per-item getItem call) would
 * make checks 1/2 exact in production — structured here to plug in.
 */

import type { EbayItem } from "@/lib/ebay-search.ts";
import type { GuardrailReason } from "@/lib/offerings/types.ts";

export type GuardrailContext = {
  /** Resolved part type / catalog name, e.g. "Front Brake Pad Set". */
  partName: string;
  /** Catalog category, e.g. "Brakes". */
  category: string;
  vehicle: { year: number | string; make: string; model: string };
};

export type GuardrailRejection = {
  itemId: string;
  title: string;
  reason: GuardrailReason;
  detail: string;
};

/** An eBay item that passed the guardrails, with kit normalization. */
export type NormalizedEbayItem = EbayItem & {
  /** Units in the listing (a "set of 4" is 4). */
  qtyIncluded: number;
  /** Per-unit item price (item price / qtyIncluded). */
  unitPrice: number;
};

export type GuardrailResult = {
  passed: NormalizedEbayItem[];
  rejected: GuardrailRejection[];
};

// ─── Token dictionaries ─────────────────────────────────────────────

const UNIVERSAL_TOKENS = [
  "universal", "custom fit", "customfit", "performance part",
  "for most", "fits most", "one size", "jdm style", "styling",
  "decorative", "cosmetic", "cover only", "sticker", "emblem only",
];

// Distinctive keyword per catalog category — the listing title must
// contain at least one, or it's not plausibly this part type.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Brakes: ["brake", "pad", "rotor", "disc", "caliper"],
  Filters: ["filter"],
  Ignition: ["spark", "plug", "coil", "ignition", "distributor"],
  Electrical: ["alternator", "starter", "battery", "sensor", "oxygen", "o2"],
  Cooling: ["water pump", "pump", "thermostat", "radiator", "coolant"],
  Lighting: ["headlight", "bulb", "fog", "lamp", "led"],
  Suspension: ["sway", "link", "control arm", "strut", "shock", "tie rod"],
};

// Wrong-platform sibling models: searching the key model, a title
// mentioning one of these values is a different platform.
const PLATFORM_CONFLICTS: Record<string, string[]> = {
  "f-150": ["f-250", "f250", "f-350", "f350", "super duty", "superduty"],
  silverado: ["2500", "3500", "hd", "heavy duty"],
  camry: ["corolla", "avalon only"],
  civic: ["type r only", "si only"],
  tacoma: ["tundra"],
};

// ─── Individual checks ──────────────────────────────────────────────

function tokenizeLower(s: string): string {
  return s.toLowerCase();
}

/**
 * 4 — detect kit / multi-pack quantity from the title.
 *
 * Conservative on purpose: normalizes ONLY when the listing clearly
 * bundles multiple COMPLETE sellable units — "pack of 2", "4-pack",
 * "2 sets", "2 pairs". Bare piece counts ("8pc", "4 piece") describe
 * the contents of a single set (a front brake-pad set is 4 pads but
 * one unit), so they do NOT normalize. Over-firing here produces a
 * misleadingly cheap per-unit price — a confident wrong recommendation,
 * the one thing we never do.
 */
function detectQty(title: string): number {
  const t = tokenizeLower(title);
  const patterns: RegExp[] = [
    /pack of (\d+)/, // "pack of 2"
    /(\d+)\s*[- ]?pack\b/, // "4-pack", "4 pack"
    /(\d+)\s*sets\b/, // "2 sets"
    /(\d+)\s*pairs\b/, // "2 pairs"
    /set of (\d+)\s*sets/, // "set of 2 sets"
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 2 && n <= 8) return n;
    }
  }
  return 1;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Apply all six guardrails to a set of eBay candidates. Returns the
 * survivors (kit-normalized) and the rejection log. Order matters:
 * cheaper checks first, condition segmentation last so a used item is
 * reported as segmented rather than mis-attributed to another reason.
 */
export function applyEbayGuardrails(
  items: EbayItem[],
  ctx: GuardrailContext
): GuardrailResult {
  const passed: NormalizedEbayItem[] = [];
  const rejected: GuardrailRejection[] = [];

  const reject = (item: EbayItem, reason: GuardrailReason, detail: string) =>
    rejected.push({ itemId: item.itemId, title: item.title, reason, detail });

  const keywords = CATEGORY_KEYWORDS[ctx.category] ?? [];
  const conflicts = PLATFORM_CONFLICTS[ctx.vehicle.model.toLowerCase()] ?? [];

  for (const item of items) {
    const title = item.title ?? "";
    const t = tokenizeLower(title);

    // 6a — junk price
    if (!Number.isFinite(item.price) || item.price <= 1) {
      reject(item, "junk_price", `price ${item.price}`);
      continue;
    }

    // 6b — placeholder part number (itemId is the only number we have
    // from search; guard defensively against obviously-placeholder ids).
    if (item.itemId.length < 5 || item.itemId.includes("~")) {
      reject(item, "placeholder_part_number", item.itemId);
      continue;
    }

    // 3 — universal / accessory / styling
    const universalHit = UNIVERSAL_TOKENS.find((tok) => t.includes(tok));
    if (universalHit) {
      reject(item, "universal_or_accessory", `matched "${universalHit}"`);
      continue;
    }

    // 1 — OE / part-type family consistency (title must be plausibly
    // this part type). With no aspect data, a category-keyword check.
    if (keywords.length > 0 && !keywords.some((k) => t.includes(k))) {
      reject(
        item,
        "oe_family_mismatch",
        `no ${ctx.category} keyword in title`
      );
      continue;
    }

    // 2 — wrong platform / body code
    const platformHit = conflicts.find((c) => t.includes(c));
    if (platformHit) {
      reject(item, "wrong_platform", `mentions "${platformHit}"`);
      continue;
    }

    // 5 — condition segmentation (used / refurb held out of default set)
    const cond = (item.condition ?? "").toLowerCase();
    if (
      cond.includes("used") ||
      cond.includes("pre-owned") ||
      cond.includes("refurb") ||
      cond.includes("for parts")
    ) {
      reject(item, "used_or_refurb_segmented", item.condition ?? "used");
      continue;
    }

    // 4 — kit / multi-pack normalization (annotate, don't reject)
    const qtyIncluded = detectQty(title);
    const unitPrice = item.price / qtyIncluded;

    passed.push({ ...item, qtyIncluded, unitPrice });
  }

  return { passed, rejected };
}

/** Empty guardrail-rejection counter, all reasons zeroed. */
export function emptyGuardrailCounts(): Record<GuardrailReason, number> {
  return {
    oe_family_mismatch: 0,
    wrong_platform: 0,
    universal_or_accessory: 0,
    junk_price: 0,
    placeholder_part_number: 0,
    used_or_refurb_segmented: 0,
  };
}
