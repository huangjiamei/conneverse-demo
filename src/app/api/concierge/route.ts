/**
 * /api/concierge
 *
 * POST — the ops-entry backend. A Conneverse ops person keys in a
 *        phoned-in local quote { partId, vehicleKey, brand, price,
 *        etaHours, deliveryLabel, warrantyDays, distributorName }.
 *        The ConciergeConnector then surfaces it as Option A material.
 * GET  — list keyed quotes (internal/ops view). `distributorName` is
 *        server-only elsewhere but visible to ops here.
 *
 * This makes Option A ("Ready Now" from a real local source) genuine
 * for pilot shops before any distributor API contract exists.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import {
  addConciergeQuote,
  listConciergeQuotes,
  vehicleKey,
  type ConciergeQuote,
} from "@/lib/connectors/concierge.ts";

type Body = Partial<Omit<ConciergeQuote, "id" | "createdAt" | "vehicleKey">> & {
  /** Either a prebuilt vehicleKey, or a vehicle to derive one from. */
  vehicleKey?: string;
  vehicle?: { year: number | string; make: string; model: string };
};

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);

  if (!body.partId || !body.distributorName || body.price == null) {
    return NextResponse.json(
      { error: "Body must include { partId, distributorName, price }" },
      { status: 400 }
    );
  }

  const key =
    body.vehicleKey ?? (body.vehicle ? vehicleKey(body.vehicle) : "*");

  const etaHours = body.etaHours ?? 2;
  const record = addConciergeQuote(
    {
      partId: body.partId,
      vehicleKey: key,
      brand: body.brand ?? "OEM",
      price: body.price,
      etaHours,
      deliveryLabel:
        body.deliveryLabel ??
        (etaHours <= 8 ? "Ready today — local pickup" : "Ready tomorrow"),
      warrantyDays: body.warrantyDays ?? 365,
      distributorName: body.distributorName,
    },
    new Date().toISOString()
  );
  return NextResponse.json(record, { status: 201 });
});

export const GET = withApi(async () => {
  return NextResponse.json({ quotes: listConciergeQuotes() });
});
