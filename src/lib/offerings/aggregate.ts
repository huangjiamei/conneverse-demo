/**
 * The aggregator — the heart of the system.
 *
 * Fetches offerings from every channel in parallel and normalizes
 * them. Gating, scoring, and Option A/B selection are delegated to
 * the optimizer (src/lib/optimizer.ts): hard gates first, soft score
 * on the survivors.
 */

import type { Part } from "@/data/parts-catalog";
import { searchEbayParts, type EbayItem } from "@/lib/ebay-search.ts";
import { applyGates, optimize } from "@/lib/optimizer";
import { ebayToOfferings, simulatedToOfferings } from "./adapters.ts";
import type {
  AggregateResult,
  Channel,
  Offering,
  RejectionReason,
} from "./types.ts";

// Strict mode: the reliability-composite floor every recommendation
// must clear. The brand position is "we recommend only verified
// options" — so a strict floor is correct.
const RELIABILITY_FLOOR = 0.65;

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

  // ─── Gate + score + pick (the optimizer) ───
  const demandContext = {
    urgency: "scheduled" as const,
    qualityFloor: RELIABILITY_FLOOR,
  };
  const recommendations = optimize(all, demandContext);
  const gateLog =
    recommendations[0]?.gateLog ?? applyGates(all, demandContext).gateLog;

  const rejections: Record<RejectionReason, number> = {
    out_of_stock: 0,
    not_fitment_verified: 0,
    below_reliability_floor: 0,
    quality_too_low: 0,
    missing_price: 0,
    missing_delivery: 0,
  };
  for (const entry of gateLog) rejections[entry.gate]++;

  const optionA =
    recommendations.find((r) => r.role === "A")?.offering ?? null;
  const optionB =
    recommendations.find((r) => r.role === "B")?.offering ?? null;

  return {
    optionA,
    optionB,
    meta: {
      channelsSearched,
      totalConsidered: all.length,
      totalAfterFilters: recommendations.length,
      rejections,
      durationMs: Date.now() - start,
    },
  };
}
