/**
 * POST /api/graduation/seed — dev-only demo data for the graduation
 * dashboard.
 *
 * Body: { shopId, category?, orders?, agreementRate? }
 * Seeds `orders` choice records (default 24) at ~`agreementRate`
 * agreement (default 0.79) for shopId × category (default "Brakes"),
 * so the dashboard has something to compute before a pilot generates
 * real volume. Disabled in production.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";

type Body = {
  shopId?: string;
  category?: string;
  orders?: number;
  agreementRate?: number;
};

const REASONS = [
  "better brand",
  "had it before",
  "faster",
  "cheaper, same thing",
  "photos looked right",
];

export const POST = withApi(async (req) => {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Seeding is disabled in production" },
      { status: 403 }
    );
  }

  const body = await readJson<Body>(req);
  if (!body.shopId) {
    return NextResponse.json(
      { error: "Body must include { shopId }" },
      { status: 400 }
    );
  }
  const category = body.category ?? "Brakes";
  const orders = Math.min(200, Math.max(1, body.orders ?? 24));
  const rate = Math.min(1, Math.max(0, body.agreementRate ?? 0.79));
  const agreements = Math.round(orders * rate);

  const now = new Date().toISOString();
  for (let i = 0; i < orders; i++) {
    const agreement = i < agreements;
    store.logChoice(
      {
        shopId: body.shopId,
        category,
        partId: "brake-pad-front",
        pickedOfferId: `po_seed_${i}`,
        pickedRole: agreement ? (i % 3 === 0 ? "B" : "A") : "candidate",
        recommendedOfferId: "po_seed_reco",
        agreement,
        deltaPrice: agreement ? null : (i % 2 === 0 ? -8.5 : 6.25),
        deltaDelivery: agreement ? null : (i % 2 === 0 ? 2 : -1),
        choiceReason: agreement ? null : REASONS[i % REASONS.length],
        freeText: null,
        whyNot: [],
        expandedOfferIds: [],
        photoOpens: i % 2,
        dwellMs: 8000 + (i % 10) * 1500,
      },
      now
    );
  }

  return NextResponse.json({ seeded: orders, agreements, category });
});
