/**
 * The aggregator — the heart of the system.
 *
 * Fetches offerings from every channel in parallel, normalizes them,
 * applies strict hard-filters, scores the survivors, picks Option A
 * and Option B.
 */

import type { Part } from "@/data/parts-catalog";
import { searchEbayParts, type EbayItem } from "@/lib/ebay-search.ts";
import { ebayToOfferings, simulatedToOfferings } from "./adapters.ts";
import type {
  AggregateResult,
  Channel,
  Offering,
  RejectionReason,
} from "./types.ts";

// ─── Hard floors (strict mode) ──────────────────────────────────────
//
// Anything that fails these is silently dropped. The brand position is
// "we recommend only verified options" — so a strict floor is correct.

const RELIABILITY_FLOOR_GENERAL = 0.65;
/** Option B can be slightly slower / cheaper but reliability bar is the same. */
const RELIABILITY_FLOOR_OPTION_B = 0.65;
const QUALITY_FLOOR = 0.55;

// ─── Score weights for ranking surviving offerings ──────────────────

const RANK_PRICE_WEIGHT = -0.50;  // cheaper better
const RANK_RELIABILITY_WEIGHT = 0.30; // more reliable better
const RANK_DELIVERY_WEIGHT = -0.20;   // faster better

/** Normalize price across the candidate set so weight is meaningful. */
function normalizePrices(offerings: Offering[]): Map<string, number> {
  if (offerings.length === 0) return new Map();
  const prices = offerings.map((o) => o.landedPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return new Map(
    offerings.map((o) => [o.id, (o.landedPrice - min) / range])
  );
}

/** Normalize delivery days similarly. */
function normalizeDelivery(offerings: Offering[]): Map<string, number> {
  if (offerings.length === 0) return new Map();
  const days = offerings.map((o) => o.deliveryDays);
  const min = Math.min(...days);
  const max = Math.max(...days);
  const range = max - min || 1;
  return new Map(
    offerings.map((o) => [o.id, (o.deliveryDays - min) / range])
  );
}

/**
 * Apply hard filters; track why each rejected offering was rejected so
 * the funnel header can show real numbers.
 */
function applyFilters(offerings: Offering[]): {
  kept: Offering[];
  rejections: Record<RejectionReason, number>;
} {
  const rejections: Record<RejectionReason, number> = {
    out_of_stock: 0,
    not_fitment_verified: 0,
    below_reliability_floor: 0,
    quality_too_low: 0,
    missing_price: 0,
    missing_delivery: 0,
  };
  const kept: Offering[] = [];

  for (const o of offerings) {
    if (!Number.isFinite(o.landedPrice) || o.landedPrice <= 0) {
      rejections.missing_price++;
      continue;
    }
    if (!Number.isFinite(o.deliveryDays)) {
      rejections.missing_delivery++;
      continue;
    }
    if (!o.fitmentVerified) {
      rejections.not_fitment_verified++;
      continue;
    }
    if (o.reliability.composite < RELIABILITY_FLOOR_GENERAL) {
      rejections.below_reliability_floor++;
      continue;
    }
    if (o.reliability.quality < QUALITY_FLOOR) {
      rejections.quality_too_low++;
      continue;
    }
    kept.push(o);
  }

  return { kept, rejections };
}

/** Rank surviving offerings on the composite value score. */
function rankOfferings(offerings: Offering[]): Offering[] {
  const priceNorm = normalizePrices(offerings);
  const deliveryNorm = normalizeDelivery(offerings);

  const scored = offerings.map((o) => {
    const p = priceNorm.get(o.id) ?? 0.5;
    const d = deliveryNorm.get(o.id) ?? 0.5;
    const score =
      RANK_PRICE_WEIGHT * p +
      RANK_RELIABILITY_WEIGHT * o.reliability.composite +
      RANK_DELIVERY_WEIGHT * d;
    return { offering: o, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.offering);
}

/**
 * Pick Option A and Option B from the ranked set.
 *
 *   Option A — "Ready Now": highest-scoring offering with delivery <= 1 day.
 *   Option B — "Best Price": among the rest, the offering with the
 *              lowest landed price that still meets the reliability bar.
 *
 * Either can be null if nothing in the candidate set qualifies.
 */
function selectTwo(
  ranked: Offering[]
): { optionA: Offering | null; optionB: Offering | null } {
  const optionA = ranked.find((o) => o.deliveryDays <= 1) ?? null;
  const rest = optionA
    ? ranked.filter((o) => o.id !== optionA.id)
    : ranked;

  // Option B: cheapest qualifying offering in the slower bucket. If no
  // slower offering exists, fall back to the cheapest of the rest.
  const slower = rest.filter((o) => o.deliveryDays > 1);
  const pool = slower.length > 0 ? slower : rest;
  const qualified = pool.filter(
    (o) => o.reliability.composite >= RELIABILITY_FLOOR_OPTION_B
  );
  const sortedByPrice = [...qualified].sort(
    (a, b) => a.landedPrice - b.landedPrice
  );
  const optionB = sortedByPrice[0] ?? null;

  return { optionA, optionB };
}

// ─── Public API ─────────────────────────────────────────────────────

export type AggregateInput = {
  part: Part;
  vehicle: { year: number | string; make: string; model: string };
  buyerZip?: string;
  /** How many eBay results to consider. Default 10. */
  ebayLimit?: number;
};

/**
 * Aggregate offerings across all channels and pick the top two.
 * Channels that fail (e.g. eBay 502) are skipped — we don't fail the
 * entire request if one source has a hiccup.
 */
export async function aggregateOfferings(
  input: AggregateInput
): Promise<AggregateResult> {
  const start = Date.now();
  const { part, vehicle, buyerZip, ebayLimit = 10 } = input;

  const channelsSearched: Channel[] = [];
  const all: Offering[] = [];

  // ─── Channel: simulated suppliers (synchronous) ───
  const simulated = simulatedToOfferings(part);
  if (simulated.length > 0) {
    all.push(...simulated);
    channelsSearched.push("simulated");
  }

  // ─── Channel: eBay (live) ───
  // Run in parallel with future channels (Amazon, etc.) by always using
  // Promise.allSettled — failure of one channel must not block others.
  const [ebayResult] = await Promise.allSettled([
    searchEbayParts(part.name, {
      limit: ebayLimit,
      vehicle,
      buyerZip,
    }),
  ]);

  if (ebayResult.status === "fulfilled") {
    const items: EbayItem[] = ebayResult.value;
    const ebayOfferings = ebayToOfferings({
      items,
      partName: part.name,
      // eBay search used compatibility_filter — by construction, all
      // returned items pass eBay's fitment table check.
      fitmentVerified: true,
    });
    all.push(...ebayOfferings);
    channelsSearched.push("ebay");
  } else {
    // Log but don't throw — degrade gracefully.
    console.error(
      "[aggregator] eBay channel failed:",
      ebayResult.reason instanceof Error
        ? ebayResult.reason.message
        : String(ebayResult.reason)
    );
  }

  // ─── Filter + rank + pick ───
  const { kept, rejections } = applyFilters(all);
  const ranked = rankOfferings(kept);
  const { optionA, optionB } = selectTwo(ranked);

  return {
    optionA,
    optionB,
    meta: {
      channelsSearched,
      totalConsidered: all.length,
      totalAfterFilters: kept.length,
      rejections,
      durationMs: Date.now() - start,
    },
  };
}
