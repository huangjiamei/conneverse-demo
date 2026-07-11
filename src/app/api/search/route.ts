/**
 * POST /api/search
 *
 * Body: { vehicle: {year, make, model}, partRequest: { partId }, zip? }
 * → PublicSearchResult (optionA/optionB as PublicOffer + funnel meta)
 *
 * Aggregates every channel, runs the optimizer (gates → score), and
 * returns ONLY the anonymized public projection — no seller/channel
 * identity, no numeric scores. This is the route the SourcingPanel
 * consumes, and the reason search results are never scrapeable: the
 * sensitive data never crosses the wire.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { PARTS_CATALOG } from "@/data/parts-catalog";
import { aggregateOfferings } from "@/lib/offerings/aggregate";
import { toPublicSearchResult } from "@/lib/offerings/public-projection";

type Body = {
  vehicle?: { year: number; make: string; model: string };
  partRequest?: { partId: string };
  zip?: string;
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

  const result = await aggregateOfferings({
    part,
    vehicle,
    buyerZip: body.zip?.trim() || undefined,
  });

  return NextResponse.json(toPublicSearchResult(result, vehicle.make));
});
