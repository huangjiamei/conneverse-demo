/**
 * /api/orders
 *
 * POST  — create a purchase order from { quoteId, sellerId, lines }
 * GET   — list orders (client-safe projection: sellerId stripped)
 *
 * Persistence-ready CRUD over the swappable DataStore. The sellerId is
 * stored server-side (needed to route the PO) but never returned to a
 * client-facing surface — GET returns PublicOrder.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";
import type { PublicOrder, PurchaseOrder } from "@/types/canonical";

type CreateBody = Omit<PurchaseOrder, "id" | "createdAt" | "status"> & {
  status?: PurchaseOrder["status"];
};

function toPublicOrder(order: PurchaseOrder): PublicOrder {
  const { sellerId: _sellerId, ...rest } = order;
  void _sellerId;
  return rest;
}

export const POST = withApi(async (req) => {
  const body = await readJson<CreateBody>(req);
  if (!body.quoteId || !body.sellerId || !Array.isArray(body.lines)) {
    return NextResponse.json(
      { error: "Body must include { quoteId, sellerId, lines[] }" },
      { status: 400 }
    );
  }
  const record = store.createOrder(
    {
      quoteId: body.quoteId,
      sellerId: body.sellerId,
      status: body.status ?? "created",
      lines: body.lines,
    },
    new Date().toISOString()
  );
  return NextResponse.json(toPublicOrder(record), { status: 201 });
});

export const GET = withApi(async () => {
  return NextResponse.json({
    orders: store.listOrders().map(toPublicOrder),
  });
});
