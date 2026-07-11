/**
 * POST /api/orders/status — the status-transition seam.
 *
 * Body: { orderId, status, note? }
 *
 * Manual today (concierge ops / the /orders board buttons); a future
 * carrier or supplier webhook handler calls the SAME store seam
 * (applyOrderStatus), so wiring real tracking later changes nothing
 * downstream.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";
import type { OrderStatus, PublicOrder, PurchaseOrder } from "@/types/canonical";

const VALID: OrderStatus[] = [
  "ordered",
  "shipped",
  "delivered",
  "installed",
  "exception",
];

type Body = { orderId?: string; status?: OrderStatus; note?: string };

function toPublicOrder(order: PurchaseOrder): PublicOrder {
  const { sellerId: _sellerId, ...rest } = order;
  void _sellerId;
  return rest;
}

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.orderId || !body.status || !VALID.includes(body.status)) {
    return NextResponse.json(
      { error: `Body must include { orderId, status: ${VALID.join("|")} }` },
      { status: 400 }
    );
  }
  const updated = store.applyOrderStatus(
    body.orderId,
    body.status,
    new Date().toISOString(),
    body.note
  );
  if (!updated) {
    return NextResponse.json({ error: "Unknown orderId" }, { status: 404 });
  }
  return NextResponse.json(toPublicOrder(updated));
});
