/**
 * POST /api/oe-consensus
 *
 * Body: { vehicle, partType, position?, partId?, query? }
 * → { results: ConsensusOE[], key }
 *
 * Direct access to the consensus OE resolver — used for testing and by
 * ops tooling. Reads the persisted table when warm; otherwise mines
 * marketplace listings, computes the cross-seller consensus, and caches
 * it. GET returns the whole persisted table.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { resolveConsensusOE, oeConsensusKey } from "@/lib/oe-resolver.ts";
import { store } from "@/lib/api/store.ts";
import type { Vehicle } from "@/types/canonical";

type Body = {
  vehicle?: Vehicle;
  partType?: string;
  position?: string | null;
  partId?: string | null;
  query?: string;
};

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.vehicle || !body.partType) {
    return NextResponse.json(
      { error: "Body must include { vehicle, partType }" },
      { status: 400 }
    );
  }
  const results = await resolveConsensusOE({
    vehicle: body.vehicle,
    partType: body.partType,
    position: body.position ?? null,
    partId: body.partId ?? null,
    query: body.query ?? body.partType,
  });
  return NextResponse.json({
    key: oeConsensusKey({
      partId: body.partId ?? null,
      vehicle: body.vehicle,
      partType: body.partType,
      position: body.position ?? null,
    }),
    results,
  });
});

export const GET = withApi(async () => {
  return NextResponse.json({ table: store.listOeConsensus() });
});
