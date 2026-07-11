/**
 * POST /api/resolve
 *
 * Body: { vehicle: Vehicle, freeText: string }
 * → ResolveResult { taxonomyId, partType, category, position,
 *                   oeNumbers[], confidence, partId, source }
 *
 * Resolution layer, staged: deterministic taxonomy/alias matching
 * first; LLM normalization (claude-haiku-4-5, constrained to the same
 * taxonomy) only for input the matcher can't place; graceful "no
 * match" when neither resolves. The UI confirm-gates every result.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { resolvePart } from "@/lib/resolve";
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
  return NextResponse.json(result);
});
