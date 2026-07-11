/**
 * /api/resolve/log
 *
 * POST — record a confirmed (freeText → partType) pair. Called when the
 *        user clicks ✓ on the resolution confirm chip; these pairs are
 *        the future training data for the resolver.
 * GET  — list logged pairs (internal/debug).
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store, type ResolutionLogEntry } from "@/lib/api/store";

type Body = Omit<ResolutionLogEntry, "id" | "createdAt">;

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.freeText || !body.taxonomyId || !body.partType || !body.vehicle) {
    return NextResponse.json(
      { error: "Body must include { freeText, vehicle, taxonomyId, partType }" },
      { status: 400 }
    );
  }
  const record = store.logResolution(
    {
      freeText: body.freeText,
      vehicle: body.vehicle,
      taxonomyId: body.taxonomyId,
      partType: body.partType,
      position: body.position ?? null,
      partId: body.partId ?? null,
      source: body.source === "llm" ? "llm" : "deterministic",
    },
    new Date().toISOString()
  );
  return NextResponse.json(record, { status: 201 });
});

export const GET = withApi(async () => {
  return NextResponse.json({ resolutions: store.listResolutions() });
});
