/**
 * POST /api/search
 *
 * Body: { vehicle: {year, make, model}, partRequest: { partId }, zip?,
 *         urgency?, tierPreference?, preferredBrands?, shopId? }
 * → PublicSearchResult (optionA/optionB as PublicOffer + funnel meta)
 *
 * Aggregates every channel, runs the demand-aware optimizer v3
 * (gates → context-weighted score), and returns ONLY the anonymized
 * public projection — no seller/channel identity, no numeric scores.
 *
 * Context, not knobs: urgency is the only per-search user input;
 * vehicleClass/partCriticality are derived server-side; the shop's
 * account policy is looked up by shopId and silently enforced; price
 * sensitivity is learned from the shop's override log.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { PARTS_CATALOG } from "@/data/parts-catalog";
import { store } from "@/lib/api/store";
import { aggregateOfferings } from "@/lib/offerings/aggregate";
import { toPublicSearchResult } from "@/lib/offerings/public-projection";
import type { AccountPolicy, Urgency } from "@/lib/optimizer";
import type { GradeTier } from "@/types/canonical";

const URGENCIES: Urgency[] = ["on_lift", "scheduled_48h", "scheduled_week"];

type Body = {
  vehicle?: { year: number; make: string; model: string };
  partRequest?: { partId: string };
  zip?: string;
  urgency?: Urgency;
  tierPreference?: GradeTier;
  preferredBrands?: string[];
  shopId?: string;
};

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  const { vehicle, partRequest } = body;

  if (!vehicle?.year || !vehicle.make || !vehicle.model || !partRequest?.partId) {
    return NextResponse.json(
      {
        error:
          "Body must include { vehicle: {year, make, model}, partRequest: {partId} }",
      },
      { status: 400 }
    );
  }

  const part = PARTS_CATALOG.find((p) => p.id === partRequest.partId);
  if (!part) {
    return NextResponse.json(
      { error: `Unknown partId: ${partRequest.partId}` },
      { status: 400 }
    );
  }

  const urgency =
    body.urgency && URGENCIES.includes(body.urgency)
      ? body.urgency
      : undefined;
  const accountPolicy = body.shopId
    ? ((store.getAccountPolicy(body.shopId) as AccountPolicy | null) ??
      undefined)
    : undefined;
  const priceSensitivity = body.shopId
    ? store.derivePriceSensitivity(body.shopId)
    : undefined;

  const result = await aggregateOfferings({
    part,
    vehicle,
    buyerZip: body.zip?.trim() || undefined,
    demand: {
      urgency,
      tierPreference: body.tierPreference,
      preferredBrands: body.preferredBrands,
      accountPolicy,
      priceSensitivity,
    },
  });

  // Debug diagnostics (rejection counts, weights, scores) only outside
  // production.
  const includeDebug = process.env.NODE_ENV !== "production";
  return NextResponse.json(
    toPublicSearchResult(result, vehicle.make, includeDebug)
  );
});
