/**
 * /api/quotes
 *
 * POST  — create a quote from { vehicle, lines, laborHours, subtotal }
 * GET   — list quotes
 *
 * Persistence-ready CRUD over the swappable DataStore (in-memory today).
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";
import type { QuoteRecord } from "@/types/canonical";

type CreateBody = Omit<QuoteRecord, "id" | "createdAt">;

export const POST = withApi(async (req) => {
  const body = await readJson<CreateBody>(req);
  if (!body.vehicle || !Array.isArray(body.lines)) {
    return NextResponse.json(
      { error: "Body must include { vehicle, lines[] }" },
      { status: 400 }
    );
  }
  const record = store.createQuote(
    {
      vehicle: body.vehicle,
      lines: body.lines,
      laborHours: body.laborHours ?? 0,
      subtotal: body.subtotal ?? 0,
    },
    new Date().toISOString()
  );
  return NextResponse.json(record, { status: 201 });
});

export const GET = withApi(async () => {
  return NextResponse.json({ quotes: store.listQuotes() });
});
