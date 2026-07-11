/**
 * /api/choices — the copilot choice / override record store.
 *
 * POST — log one selection: which offer the advisor picked, whether it
 *        agreed with the machine pick, the optional reason chip + free
 *        text, per-candidate why-not chips, and implicit signals
 *        (expanded ids, photo opens, dwell). Two training label streams
 *        ride on this: choiceReason → shop-preference training; whyNot →
 *        quality/fitment training.
 * GET  — list records (feeds the graduation dashboard).
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store, type ChoiceRecord } from "@/lib/api/store";

type Body = Partial<Omit<ChoiceRecord, "id" | "createdAt">>;

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.shopId || !body.category || !body.pickedOfferId) {
    return NextResponse.json(
      { error: "Body must include { shopId, category, pickedOfferId }" },
      { status: 400 }
    );
  }
  const record = store.logChoice(
    {
      shopId: body.shopId,
      category: body.category,
      partId: body.partId ?? "",
      pickedOfferId: body.pickedOfferId,
      pickedRole: body.pickedRole ?? "candidate",
      recommendedOfferId: body.recommendedOfferId ?? null,
      agreement: body.agreement ?? body.pickedRole !== "candidate",
      choiceReason: body.choiceReason ?? null,
      freeText: body.freeText ?? null,
      whyNot: body.whyNot ?? [],
      expandedOfferIds: body.expandedOfferIds ?? [],
      photoOpens: body.photoOpens ?? 0,
      dwellMs: body.dwellMs ?? 0,
    },
    new Date().toISOString()
  );
  return NextResponse.json(record, { status: 201 });
});

export const GET = withApi(async () => {
  return NextResponse.json({ choices: store.listChoices() });
});
