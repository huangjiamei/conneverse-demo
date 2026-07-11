/**
 * The aggregator — the heart of the system.
 *
 * Fans out to every registered SupplierConnector in parallel, merges
 * their offers, then delegates gating, scoring, and Option A/B
 * selection to the optimizer (src/lib/optimizer.ts): hard gates first,
 * soft score on the survivors.
 *
 * Connectors are the seam: eBay + simulated archetypes + concierge
 * today; a local-distributor / Amazon / DTC connector drops in with no
 * change here. Marketplace guardrails run INSIDE each connector, before
 * the optimizer ever sees a candidate.
 */

import type { Part } from "@/data/parts-catalog";
import { applyGates, optimize } from "@/lib/optimizer";
import { EbayConnector } from "@/lib/connectors/ebay.ts";
import { SimulatedConnector } from "@/lib/connectors/simulated.ts";
import { ConciergeConnector } from "@/lib/connectors/concierge.ts";
import type {
  ConnectorContext,
  ConnectorDiagnostics,
  SupplierConnector,
} from "@/lib/connectors/SupplierConnector.ts";
import { emptyGuardrailCounts } from "@/lib/guardrails.ts";
import { store } from "@/lib/api/store.ts";
import { oeConsensusKey } from "@/lib/oe-resolver.ts";
import type { Vehicle } from "@/types/canonical";
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

// The connector registry. Order is irrelevant — the optimizer ranks the
// merged set. Add a connector here and it's live everywhere.
const CONNECTORS: SupplierConnector[] = [
  new SimulatedConnector(),
  new EbayConnector(),
  new ConciergeConnector(),
];

// ─── Public API ─────────────────────────────────────────────────────

export type AggregateInput = {
  part: Part;
  vehicle: { year: number | string; make: string; model: string };
  buyerZip?: string;
  /** How many marketplace results to consider per connector. Default 10. */
  ebayLimit?: number;
};

/**
 * Aggregate offerings across all connectors and pick the top two.
 * Connectors that fail return `[]` (they swallow their own errors) — we
 * never fail the whole request because one source had a hiccup.
 */
export async function aggregateOfferings(
  input: AggregateInput
): Promise<AggregateResult> {
  const start = Date.now();
  const { part, vehicle, buyerZip, ebayLimit = 10 } = input;

  const partRequest = {
    partId: part.id,
    category: part.category,
    name: part.name,
  };
  const normalizedVehicle: Vehicle = {
    year: Number(vehicle.year),
    make: vehicle.make,
    model: vehicle.model,
  };

  // Prefer OE hard-match when the consensus resolver has already cached
  // real OE numbers for this part (populated by /api/resolve or a prior
  // consensus run). Only use numbers with cross-seller agreement (≥2).
  const cachedOe = store.getOeConsensus(
    oeConsensusKey({
      partId: part.id,
      vehicle: normalizedVehicle,
      partType: part.name,
      position: null,
    })
  );
  const oeNumbers =
    cachedOe?.filter((c) => c.sellerCount >= 2).map((c) => c.oeNumber) ?? [];

  const diagnostics: ConnectorDiagnostics = { guardrailRejections: [] };
  const ctx: ConnectorContext = {
    buyerZip,
    limit: ebayLimit,
    oeNumbers,
    diagnostics,
  };

  // Fan out to every connector in parallel.
  const settled = await Promise.allSettled(
    CONNECTORS.map((c) => c.getQuotes(partRequest, normalizedVehicle, ctx))
  );

  const all: Offering[] = [];
  const channelsSearched: Channel[] = [];
  settled.forEach((result, i) => {
    const connector = CONNECTORS[i];
    if (result.status === "fulfilled") {
      if (result.value.length > 0) {
        all.push(...result.value);
        if (!channelsSearched.includes(connector.channel)) {
          channelsSearched.push(connector.channel);
        }
      }
    } else {
      console.error(
        `[aggregator] connector "${connector.id}" failed:`,
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      );
    }
  });

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

  // Guardrail rejection counts (pre-optimizer, from the connectors).
  const guardrailRejections = emptyGuardrailCounts();
  for (const r of diagnostics.guardrailRejections) {
    guardrailRejections[r.reason]++;
  }

  const optionA =
    recommendations.find((r) => r.role === "A")?.offering ?? null;
  const optionB =
    recommendations.find((r) => r.role === "B")?.offering ?? null;

  // Everything the optimizer/guardrails filtered, for the funnel copy.
  const guardrailDropped = diagnostics.guardrailRejections.length;

  return {
    optionA,
    optionB,
    meta: {
      channelsSearched,
      totalConsidered: all.length + guardrailDropped,
      totalAfterFilters: recommendations.length,
      rejections,
      guardrailRejections,
      matchStrategy: diagnostics.matchStrategy ?? "keyword",
      oeNumbers,
      durationMs: Date.now() - start,
    },
  };
}
