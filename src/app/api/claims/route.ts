/**
 * /api/claims — warranty/returns claims.
 *
 * POST { orderId, lineId, reason, resolution?, photoRef?,
 *        mileageAtInstall? }
 *   Server pre-fills everything else from the order (part, vehicle,
 *   dates, seller) — the user never retypes. Instant resolution: line
 *   totals at or below SHOP_CONFIG.autoApproveLimit auto-approve
 *   (replacement by default; pickup bundles with the next delivery;
 *   credit memo auto-generated; RMA created server-side and NEVER
 *   returned). Above the limit → under_review, answer within 4
 *   business hours.
 *
 * GET ?orderId= — list claims as PublicClaim (sellerId + rmaId
 * stripped).
 *
 * Every claim is an outcome record — optimizer-v4 training data, with
 * the reason mapped to the component it trains. Return rates must use
 * ALL delivered lines as the denominator, never claims alone.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";
import { SHOP_CONFIG } from "@/data/shop-config";
import {
  CLAIM_TRAINING_MAP,
  type ClaimReason,
  type ClaimRecord,
  type ClaimResolution,
  type PublicClaim,
} from "@/types/canonical";

const REASONS: ClaimReason[] = [
  "doesnt_fit",
  "failed_after_install",
  "arrived_damaged",
  "no_longer_needed",
];

type Body = {
  orderId?: string;
  lineId?: string;
  reason?: ClaimReason;
  resolution?: ClaimResolution;
  photoRef?: string | null;
  mileageAtInstall?: number | null;
};

function toPublicClaim(claim: ClaimRecord): PublicClaim {
  const { sellerId: _s, rmaId: _r, ...rest } = claim;
  void _s;
  void _r;
  return rest;
}

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.orderId || !body.lineId || !REASONS.includes(body.reason!)) {
    return NextResponse.json(
      {
        error: `Body must include { orderId, lineId, reason: ${REASONS.join("|")} }`,
      },
      { status: 400 }
    );
  }

  const order = store.getOrder(body.orderId);
  if (!order) {
    return NextResponse.json({ error: "Unknown orderId" }, { status: 404 });
  }
  const line = order.lines.find((l) => l.id === body.lineId);
  if (!line) {
    return NextResponse.json({ error: "Unknown lineId" }, { status: 404 });
  }
  if (order.status !== "delivered" && order.status !== "installed") {
    return NextResponse.json(
      { error: "Claims are available once the order is delivered" },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const deliveredAt =
    order.carrierEvents.findLast((e) => e.stage === "delivered")?.at ??
    order.statusHistory.findLast((h) => h.status === "delivered")?.at ??
    order.etaDate;

  const timeToFailureDays = Math.max(
    0,
    Math.round(
      (new Date(nowIso).getTime() - new Date(deliveredAt).getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );

  const lineTotal = line.unitPricePaid * line.qty;
  const autoApproved = lineTotal <= SHOP_CONFIG.autoApproveLimit;
  const reason = body.reason!;
  const resolution: ClaimResolution = body.resolution ?? "replacement";

  const claim = store.createClaim(
    {
      orderId: order.id,
      lineId: line.id,
      sku: line.partNumber,
      oeNumber: line.partNumber,
      sellerId: order.sellerId, // server-only
      brand: line.brand,
      vehicle: order.vehicle,
      shopId: order.shopId,
      reason,
      trainsComponent: CLAIM_TRAINING_MAP[reason],
      photoRef: body.photoRef ?? null,
      resolution,
      orderedAt: order.createdAt,
      deliveredAt,
      claimedAt: nowIso,
      timeToFailureDays,
      mileageAtInstall: body.mileageAtInstall ?? null,
      status: autoApproved ? "approved" : "under_review",
      statusHistory: [
        { status: autoApproved ? "approved" : "under_review", at: nowIso },
      ],
      autoApproved,
      // Credit memo + RMA are generated on approval. RMA never leaves
      // the server.
      creditMemoId: autoApproved ? `cm_${claim_seed()}` : null,
      rmaId: autoApproved ? `rma_${claim_seed()}` : null,
    },
    nowIso
  );

  return NextResponse.json(toPublicClaim(claim), { status: 201 });
});

let seedCounter = 0;
function claim_seed(): string {
  seedCounter++;
  return `${Date.now().toString(36)}${seedCounter}`;
}

export const GET = withApi(async (req) => {
  const orderId = req.nextUrl.searchParams.get("orderId") ?? undefined;
  return NextResponse.json({
    claims: store.listClaims(orderId).map(toPublicClaim),
  });
});
