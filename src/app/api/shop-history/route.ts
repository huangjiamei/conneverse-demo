/**
 * /api/shop-history — the shop's own paid-price history (savings
 * baseline #1).
 *
 * POST { csv } — import rows shaped like the Parts Daily Report export:
 *   date,oe_number,description,brand,qty,unit_price
 *   2026-05-02,04465-0E060,Front brake pads,Toyota,1,61.20
 *   Header row optional. Blank lines skipped. Returns counts.
 * GET — { count } of imported entries.
 *
 * Baseline lookups staleness-decay entries older than 6 months.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store, type ShopHistoryEntry } from "@/lib/api/store";

type Body = { csv?: string };

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.csv?.trim()) {
    return NextResponse.json(
      { error: "Body must include { csv }" },
      { status: 400 }
    );
  }

  const rows = body.csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: Array<Omit<ShopHistoryEntry, "id">> = [];
  let skipped = 0;
  for (const row of rows) {
    const cols = row.split(",").map((c) => c.trim());
    // Skip a header row.
    if (/^date$/i.test(cols[0] ?? "")) continue;
    const [date, oeNumber, description, brand, qtyRaw, priceRaw] = cols;
    const qty = Number(qtyRaw);
    const unitPrice = Number(priceRaw);
    if (
      !date ||
      !oeNumber ||
      Number.isNaN(new Date(date).getTime()) ||
      !Number.isFinite(qty) ||
      !Number.isFinite(unitPrice)
    ) {
      skipped++;
      continue;
    }
    entries.push({
      date: new Date(date).toISOString(),
      oeNumber,
      description: description ?? "",
      brand: brand ?? "",
      qty: Math.max(1, qty),
      unitPrice,
    });
  }

  const imported = store.importShopHistory(entries);
  return NextResponse.json({
    imported,
    skipped,
    total: store.countShopHistory(),
  });
});

export const GET = withApi(async () => {
  return NextResponse.json({ count: store.countShopHistory() });
});
