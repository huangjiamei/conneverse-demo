/**
 * POST /api/optimize-ro — whole-RO consolidation.
 *
 * Body: { vehicle, partIds: string[], zip?, urgency? }
 * → { independent, consolidated, accepted, summary }
 *
 * Sources every line, then compares the per-line-optimal plan against a
 * supplier-consolidated plan. The consolidated plan wins only when its
 * total-cost delta stays inside the configured ceiling — fewer delivery
 * events beats a few dollars, not many.
 *
 * Anonymized: plans expose supplier COUNTS and per-line PublicOffers —
 * never seller identity.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { PARTS_CATALOG } from "@/data/parts-catalog";
import { aggregateOfferings } from "@/lib/offerings/aggregate";
import { toPublicOffer } from "@/lib/offerings/public-projection";
import {
  consolidateRo,
  OPTIMIZER_WEIGHTS,
  type Urgency,
  type RoPlan,
} from "@/lib/optimizer";
import type { Vehicle } from "@/types/canonical";

type Body = {
  vehicle?: Vehicle;
  partIds?: string[];
  zip?: string;
  urgency?: Urgency;
};

function publicPlan(
  plan: RoPlan,
  partNames: string[],
  make: string
) {
  return {
    totalCost: plan.totalCost,
    supplierCount: plan.supplierCount,
    deliveryEvents: plan.deliveryEvents,
    lines: plan.assignments.map((a) => ({
      part: partNames[a.lineIndex],
      offer: toPublicOffer(a.offering, "candidate", make),
    })),
  };
}

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.vehicle || !Array.isArray(body.partIds) || body.partIds.length < 2) {
    return NextResponse.json(
      { error: "Body must include { vehicle, partIds: [>=2 part ids] }" },
      { status: 400 }
    );
  }

  const parts = body.partIds.map((id) =>
    PARTS_CATALOG.find((p) => p.id === id)
  );
  const missing = body.partIds.filter((_, i) => !parts[i]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Unknown partIds: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  // Source every line (parallel; each aggregation fans out internally).
  const results = await Promise.all(
    parts.map((part) =>
      aggregateOfferings({
        part: part!,
        vehicle: body.vehicle!,
        buyerZip: body.zip?.trim() || undefined,
        demand: { urgency: body.urgency, consolidateSuppliers: true },
      })
    )
  );

  const lineCandidates = results.map((r) => r.candidates);
  const { independent, consolidated, accepted } = consolidateRo(
    lineCandidates,
    { urgency: body.urgency }
  );

  const partNames = parts.map((p) => p!.name);
  const make = body.vehicle.make;
  const delta = consolidated.totalCost - independent.totalCost;

  return NextResponse.json({
    independent: publicPlan(independent, partNames, make),
    consolidated: publicPlan(consolidated, partNames, make),
    accepted,
    summary: accepted
      ? `Consolidated ${independent.supplierCount} suppliers → ${consolidated.supplierCount} (${consolidated.deliveryEvents} delivery event${consolidated.deliveryEvents === 1 ? "" : "s"}) for ${delta >= 0 ? "+" : "−"}$${Math.abs(delta).toFixed(2)} (within the ${Math.round(OPTIMIZER_WEIGHTS.consolidation.maxTotalCostDeltaPct * 100)}% ceiling)`
      : `Kept per-line picks — consolidation would cost ${delta >= 0 ? "+" : "−"}$${Math.abs(delta).toFixed(2)}, outside the ${Math.round(OPTIMIZER_WEIGHTS.consolidation.maxTotalCostDeltaPct * 100)}% ceiling (or saves no delivery events)`,
  });
});
