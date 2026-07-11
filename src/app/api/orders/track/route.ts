/**
 * POST /api/orders/track — append a VERIFIED carrier event.
 *
 * Body: { orderId, stage, location?, note? }
 *
 * The tracker's only data source. Manual ops today; a real carrier
 * webhook calls the same store seam (appendCarrierEvent). Rejects
 * stages the order's source doesn't support — stages are never faked.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";
import type {
  PublicOrder,
  PurchaseOrder,
  TrackerStage,
} from "@/types/canonical";

type Body = {
  orderId?: string;
  stage?: TrackerStage;
  location?: string;
  note?: string;
};

function toPublicOrder(order: PurchaseOrder): PublicOrder {
  const { sellerId: _sellerId, ...rest } = order;
  void _sellerId;
  return rest;
}

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.orderId || !body.stage) {
    return NextResponse.json(
      { error: "Body must include { orderId, stage }" },
      { status: 400 }
    );
  }
  const order = store.getOrder(body.orderId);
  if (!order) {
    return NextResponse.json({ error: "Unknown orderId" }, { status: 404 });
  }
  if (!order.supportedStages.includes(body.stage)) {
    return NextResponse.json(
      {
        error: `This order's source reports only: ${order.supportedStages.join(", ")}`,
      },
      { status: 400 }
    );
  }
  const updated = store.appendCarrierEvent(body.orderId, {
    stage: body.stage,
    at: new Date().toISOString(),
    location: body.location,
    note: body.note,
  });
  return NextResponse.json(toPublicOrder(updated!));
});
