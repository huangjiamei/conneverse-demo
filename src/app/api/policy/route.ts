/**
 * /api/policy — chain account policy (admin-only surface).
 *
 * POST { shopId, policy: { tierFloorByCategory?, priceCapPerLine?,
 *        approvalThreshold? } | null }
 * GET  ?shopId=
 *
 * Set from the /ops console; advisors never see it. The optimizer
 * silently enforces it as hard gates and the dev debug panel logs
 * policy hits.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";
import type { AccountPolicy } from "@/lib/optimizer";

type Body = { shopId?: string; policy?: AccountPolicy | null };

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.shopId) {
    return NextResponse.json(
      { error: "Body must include { shopId }" },
      { status: 400 }
    );
  }
  store.setAccountPolicy(body.shopId, body.policy ?? null);
  return NextResponse.json({ shopId: body.shopId, policy: body.policy ?? null });
});

export const GET = withApi(async (req) => {
  const shopId = req.nextUrl.searchParams.get("shopId");
  if (!shopId) {
    return NextResponse.json({ error: "shopId required" }, { status: 400 });
  }
  return NextResponse.json({
    shopId,
    policy: store.getAccountPolicy(shopId),
  });
});
