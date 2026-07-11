/**
 * /api/orders
 *
 * POST — place an order from quote lines. The server:
 *   1. Maps each line's opaque offerId back to its seller (offer index
 *      written at projection time) and GROUPS lines per seller — one
 *      purchase order per supplier, seller identity server-only.
 *   2. Computes each line's savings baseline via the strict hierarchy:
 *      shop_history (same OE number, ≤6 months old) →
 *      market_snapshot (same-search incumbent alternative; same tier +
 *      condition, else the delta is recorded as tierChoiceDelta) →
 *      none (excluded from all savings totals).
 *   3. Sets the promised ETA from the line's delivery estimate.
 *
 * GET — list orders as PublicOrder (sellerId stripped).
 *
 * Body:
 * { quoteId?, shopId, vehicle, lines: [{ offerId, partName, partNumber,
 *   brand, gradeTier, condition, qty, unitPrice, deliveryDays,
 *   marketBaseline? }] }
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";
import type {
  GradeTier,
  MarketBaseline,
  OrderLine,
  OrderUrgency,
  PublicOrder,
  PurchaseOrder,
  SavingsBaseline,
  TrackerStage,
  Vehicle,
} from "@/types/canonical";

type InputLine = {
  offerId?: string;
  catalogPartId?: string;
  partName?: string;
  partNumber?: string;
  brand?: string;
  gradeTier?: GradeTier;
  condition?: string;
  qty?: number;
  unitPrice?: number;
  deliveryDays?: number;
  marketBaseline?: MarketBaseline | null;
};

type Body = {
  quoteId?: string;
  shopId?: string;
  vehicle?: Vehicle;
  urgency?: OrderUrgency;
  lines?: InputLine[];
};

/** Milestone stages a source can actually report. Marketplace carriers
 * expose a coarser feed (3 stages); catalog/concierge channels report
 * all 5. The tracker renders exactly this set — never interpolated. */
const STAGES_BY_CHANNEL: Record<string, TrackerStage[]> = {
  ebay: ["ordered", "in_transit", "delivered"],
  simulated: ["ordered", "confirmed", "in_transit", "out_for_delivery", "delivered"],
  local: ["ordered", "confirmed", "in_transit", "out_for_delivery", "delivered"],
};

function toPublicOrder(order: PurchaseOrder): PublicOrder {
  const { sellerId: _sellerId, ...rest } = order;
  void _sellerId;
  return rest;
}

/** The strict baseline hierarchy. */
function computeBaseline(
  line: InputLine,
  now: string
): SavingsBaseline {
  const pricePaid = line.unitPrice ?? 0;

  // 1 — shop history (same OE number, staleness-decayed)
  if (line.partNumber) {
    const history = store.getShopHistoryBaseline(line.partNumber, now);
    if (history) {
      return {
        baselinePrice: Math.round(history.avgPrice * 100) / 100,
        baselineSource: "shop_history",
        baselineTimestamp: history.latest,
        tierChoiceDelta: null,
      };
    }
  }

  // 2 — market snapshot (same search). Like-for-like guard: the
  // baseline must match tier AND condition, otherwise the delta is a
  // tier choice, never savings.
  const snap = line.marketBaseline;
  if (snap) {
    const likeForLike =
      snap.gradeTier === line.gradeTier && snap.condition === line.condition;
    if (likeForLike) {
      return {
        baselinePrice: snap.price,
        baselineSource: "market_snapshot",
        baselineTimestamp: snap.capturedAt,
        tierChoiceDelta: null,
      };
    }
    return {
      baselinePrice: null,
      baselineSource: "none",
      baselineTimestamp: null,
      tierChoiceDelta: Math.round((snap.price - pricePaid) * 100) / 100,
    };
  }

  // 3 — none
  return {
    baselinePrice: null,
    baselineSource: "none",
    baselineTimestamp: null,
    tierChoiceDelta: null,
  };
}

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (
    !body.shopId ||
    !body.vehicle ||
    !Array.isArray(body.lines) ||
    body.lines.length === 0
  ) {
    return NextResponse.json(
      { error: "Body must include { shopId, vehicle, lines[] }" },
      { status: 400 }
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Group lines per seller via the projection-time offer index.
  const groups = new Map<string, { lines: InputLine[]; channel: string }>();
  for (const line of body.lines) {
    const seller = line.offerId ? store.lookupOffer(line.offerId) : null;
    const key = seller?.sellerId ?? "conneverse:unrouted";
    if (!groups.has(key)) {
      groups.set(key, { lines: [], channel: seller?.channel ?? "simulated" });
    }
    groups.get(key)!.lines.push(line);
  }

  const created: PublicOrder[] = [];
  let counter = 0;
  for (const [sellerId, group] of groups) {
    counter++;
    const { lines, channel } = group;
    const maxDays = Math.max(0, ...lines.map((l) => l.deliveryDays ?? 3));
    const eta = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);

    const orderLines: OrderLine[] = lines.map((l, i) => ({
      id: `ol_${counter}_${i}`,
      partName: l.partName ?? "Part",
      partNumber: l.partNumber ?? "",
      brand: l.brand ?? "—",
      gradeTier: l.gradeTier ?? "value_aftermarket",
      condition: l.condition ?? "new",
      qty: Math.max(1, l.qty ?? 1),
      unitPricePaid: l.unitPrice ?? 0,
      baseline: computeBaseline(l, nowIso),
      catalogPartId: l.catalogPartId,
    }));

    const order = store.createOrder(
      {
        quoteId: body.quoteId ?? null,
        shopId: body.shopId,
        vehicle: body.vehicle,
        sellerId,
        status: "ordered",
        statusHistory: [{ status: "ordered", at: nowIso }],
        etaDate: eta.toISOString(),
        carrierEvents: [{ stage: "ordered", at: nowIso }],
        supportedStages:
          STAGES_BY_CHANNEL[channel] ?? STAGES_BY_CHANNEL.simulated,
        urgency: body.urgency ?? "scheduled",
        lines: orderLines,
      },
      nowIso
    );
    created.push(toPublicOrder(order));
  }

  return NextResponse.json({ orders: created }, { status: 201 });
});

export const GET = withApi(async () => {
  return NextResponse.json({
    orders: store.listOrders().map(toPublicOrder),
  });
});
