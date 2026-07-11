/**
 * GET /api/ebay/search
 *
 * Browser-callable proxy for the eBay Browse API. Runs server-side so
 * the eBay client credentials never reach the client bundle.
 *
 * Query parameters:
 *   q          (required)  search keywords, e.g. "brake pads"
 *   limit      (optional)  number of items to return (1–200, default 10)
 *   sort       (optional)  "price" | "-price" | "newlyListed" | "endingSoonest"
 *   condition  (optional)  comma-separated eBay condition IDs (e.g. "1000,1500")
 *   zip        (optional)  buyer ZIP — unlocks real delivery date estimates
 *   year       (optional)  vehicle year   — triple of year+make+model enables
 *   make       (optional)  vehicle make     eBay's compatibility filter, which
 *   model      (optional)  vehicle model    drops listings that don't fit.
 *   trim       (optional)  vehicle trim (extra precision; optional)
 *   engine     (optional)  vehicle engine (extra precision; optional)
 *
 * Success response (200):
 *   { items: EbayItem[], count: number }
 *
 * Error responses:
 *   400  bad / missing query params
 *   401  no session (this route exposes seller-identifying eBay data,
 *        so it is gated behind withApi — internal/debug use only, NOT a
 *        client-facing surface)
 *   429  rate limited
 *   502  eBay rejected the upstream request
 *   500  unexpected server error
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApi } from "@/lib/api/with-api";
import {
  searchEbayParts,
  type SearchOptions,
} from "@/lib/ebay-search.ts";

const VALID_SORTS = [
  "price",
  "-price",
  "newlyListed",
  "endingSoonest",
] as const;

type SortValue = (typeof VALID_SORTS)[number];

function isValidSort(value: string): value is SortValue {
  return (VALID_SORTS as readonly string[]).includes(value);
}

export const GET = withApi(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;

  const q = params.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { error: "Missing required query parameter: q" },
      { status: 400 }
    );
  }

  const options: SearchOptions = {};

  const limitParam = params.get("limit");
  if (limitParam !== null) {
    const n = Number(limitParam);
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      return NextResponse.json(
        { error: "limit must be a number between 1 and 200" },
        { status: 400 }
      );
    }
    options.limit = Math.floor(n);
  }

  const sortParam = params.get("sort");
  if (sortParam !== null) {
    if (!isValidSort(sortParam)) {
      return NextResponse.json(
        {
          error: `sort must be one of: ${VALID_SORTS.join(", ")}`,
        },
        { status: 400 }
      );
    }
    options.sort = sortParam;
  }

  const conditionParam = params.get("condition");
  if (conditionParam !== null) {
    const ids = conditionParam
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (ids.length > 0) options.conditionIds = ids;
  }

  const zip = params.get("zip")?.trim();
  if (zip) options.buyerZip = zip;

  // Vehicle compatibility — requires year+make+model together.
  const year = params.get("year")?.trim();
  const make = params.get("make")?.trim();
  const model = params.get("model")?.trim();
  if (year && make && model) {
    const trim = params.get("trim")?.trim() || undefined;
    const engine = params.get("engine")?.trim() || undefined;
    options.vehicle = { year, make, model, trim, engine };
  } else if (year || make || model) {
    return NextResponse.json(
      {
        error:
          "Vehicle compatibility requires all three of: year, make, model",
      },
      { status: 400 }
    );
  }

  try {
    const items = await searchEbayParts(q, options);
    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/ebay/search] error:", message);

    // Distinguish upstream eBay failures (we have an error from eBay)
    // from unexpected server errors.
    const isUpstream = message.startsWith("eBay ");
    return NextResponse.json(
      {
        error: isUpstream ? "eBay search failed" : "Internal server error",
        detail: message,
      },
      { status: isUpstream ? 502 : 500 }
    );
  }
});
