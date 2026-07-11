/**
 * /api/curation — internal photo-curation queue (copilot media rules).
 *
 * GET  ?status=pending|approved|rejected — list entries (default: all)
 * POST { id, action: "approve" | "reject" } — review one photo
 *
 * Marketplace listing photos can leak seller identity, so they are
 * withheld from every client response until a reviewer approves them
 * here. Rejection is permanent (idempotent re-review allowed).
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store, type PhotoCurationStatus } from "@/lib/api/store";

export const GET = withApi(async (req) => {
  const status = req.nextUrl.searchParams.get("status");
  const valid: PhotoCurationStatus[] = ["pending", "approved", "rejected"];
  const filter = valid.includes(status as PhotoCurationStatus)
    ? (status as PhotoCurationStatus)
    : undefined;
  return NextResponse.json({ photos: store.listPhotos(filter) });
});

type Body = { id?: string; action?: "approve" | "reject" };

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.id || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json(
      { error: 'Body must include { id, action: "approve" | "reject" }' },
      { status: 400 }
    );
  }
  const updated = store.reviewPhoto(
    body.id,
    body.action === "approve" ? "approved" : "rejected",
    new Date().toISOString()
  );
  if (!updated) {
    return NextResponse.json({ error: "Unknown photo id" }, { status: 404 });
  }
  return NextResponse.json(updated);
});
