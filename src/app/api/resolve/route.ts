/**
 * POST /api/resolve
 *
 * Body: { vehicle: Vehicle, freeText: string }
 * → { partType, position, oeNumbers[], confidence, partId }
 *
 * Resolution layer (front half). Simulated matcher today; LLM
 * normalization + consensus OE resolution land in Prompt 3.
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
  const result = resolvePart(body.vehicle, body.freeText);
  return NextResponse.json(result);
});
