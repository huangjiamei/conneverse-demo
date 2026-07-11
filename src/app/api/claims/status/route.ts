/**
 * POST /api/claims/status — advance a claim through its mini-tracker:
 * approved → replacement_shipped → picked_up → credited (or approve an
 * under_review claim). Manual ops today; webhook-ready seam.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";
import type { ClaimStatus, PublicClaim, ClaimRecord } from "@/types/canonical";

const VALID: ClaimStatus[] = [
  "under_review",
  "approved",
  "replacement_shipped",
  "picked_up",
  "credited",
];

type Body = { claimId?: string; status?: ClaimStatus };

function toPublicClaim(claim: ClaimRecord): PublicClaim {
  const { sellerId: _s, rmaId: _r, ...rest } = claim;
  void _s;
  void _r;
  return rest;
}

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.claimId || !body.status || !VALID.includes(body.status)) {
    return NextResponse.json(
      { error: `Body must include { claimId, status: ${VALID.join("|")} }` },
      { status: 400 }
    );
  }
  const updated = store.applyClaimStatus(
    body.claimId,
    body.status,
    new Date().toISOString()
  );
  if (!updated) {
    return NextResponse.json({ error: "Unknown claimId" }, { status: 404 });
  }
  return NextResponse.json(toPublicClaim(updated));
});
