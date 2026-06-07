/**
 * GET /api/offerings
 *
 * Channel-agnostic offerings endpoint. Aggregates simulated + live
 * channels (eBay today; Amazon, local distributors, DTC later),
 * applies strict reliability filters, returns Option A + Option B
 * and the funnel metadata.
 *
 * Query parameters:
 *   partId  (required)  Part.id from src/data/parts-catalog
 *   year    (required)  vehicle year
 *   make    (required)  vehicle make
 *   model   (required)  vehicle model
 *   zip     (optional)  buyer ZIP — unlocks real delivery dates
 *
 * Success: 200 { optionA, optionB, meta }
 * Errors:  400 missing params / unknown partId · 502 aggregator failure
 */

import { NextResponse, type NextRequest } from "next/server";
import { PARTS_CATALOG } from "@/data/parts-catalog";
import { aggregateOfferings } from "@/lib/offerings/aggregate.ts";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const partId = params.get("partId")?.trim();
  const yearRaw = params.get("year")?.trim();
  const make = params.get("make")?.trim();
  const model = params.get("model")?.trim();

  if (!partId || !yearRaw || !make || !model) {
    return NextResponse.json(
      {
        error:
          "Missing required parameters. Required: partId, year, make, model",
      },
      { status: 400 }
    );
  }

  const year = Number(yearRaw);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return NextResponse.json(
      { error: "year must be a valid 4-digit integer" },
      { status: 400 }
    );
  }

  const part = PARTS_CATALOG.find((p) => p.id === partId);
  if (!part) {
    return NextResponse.json(
      { error: `Unknown partId: ${partId}` },
      { status: 400 }
    );
  }

  const zip = params.get("zip")?.trim() || undefined;

  try {
    const result = await aggregateOfferings({
      part,
      vehicle: { year, make, model },
      buyerZip: zip,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/offerings] aggregator failed:", message);
    return NextResponse.json(
      { error: "Aggregator failed", detail: message },
      { status: 502 }
    );
  }
}
