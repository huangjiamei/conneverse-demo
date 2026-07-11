/**
 * POST /api/resolve
 *
 * Body: { vehicle: Vehicle, freeText: string }
 * → ResolveResult + { consensusOe: ConsensusOE[] }
 *
 * Resolution layer, staged: deterministic taxonomy/alias matching
 * first; LLM normalization (claude-haiku-4-5, constrained to the same
 * taxonomy) only for input the matcher can't place; graceful "no
 * match" when neither resolves. The UI confirm-gates every result.
 *
 * After normalization, the consensus OE resolver attaches real OE / MPN
 * numbers mined from marketplace listings (best-effort — a slow or
 * failed lookup never blocks the resolution). It also warms the OE cache
 * so /api/search can prefer an OE hard-match.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { resolvePart } from "@/lib/resolve";
import { resolveConsensusOE } from "@/lib/oe-resolver.ts";
import type { Vehicle } from "@/types/canonical";

type Body = { vehicle?: Vehicle; freeText?: string };

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.vehicle || !body.freeText) {
    return NextResponse.json(
      { error: "Body must include { vehicle, freeText }" },
      { status: 400 }
    );
  }
  const result = await resolvePart(body.vehicle, body.freeText);

  let consensusOe: Awaited<ReturnType<typeof resolveConsensusOE>> = [];
  if (result.partType) {
    try {
      consensusOe = await resolveConsensusOE({
        vehicle: body.vehicle,
        partType: result.partType,
        position: result.position,
        partId: result.partId,
        query: result.partType,
      });
    } catch {
      // Best-effort — resolution still returns without OE numbers.
    }
  }

  return NextResponse.json({ ...result, consensusOe });
});
