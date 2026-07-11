/**
 * POST /api/vin
 *
 * Body: { vin: string }
 * → { decode: VinDecode, catalog: CatalogMatch }
 *
 * Decodes a VIN via NHTSA vPIC (server-side, cached) and reconciles it
 * against the demo parts catalog. `catalog` is non-null only when the
 * vehicle is covered — the UI uses it to wire the vehicle into search,
 * and falls back to the dropdowns otherwise.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { decodeVin, isValidVinFormat, matchCatalog } from "@/lib/connectors/vpic";

type Body = { vin?: string };

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  const vin = body.vin?.trim();

  if (!vin) {
    return NextResponse.json(
      { error: "Body must include { vin }" },
      { status: 400 }
    );
  }
  if (!isValidVinFormat(vin)) {
    return NextResponse.json(
      { error: "Invalid VIN format. Expected 17 characters (no I, O, or Q)." },
      { status: 400 }
    );
  }

  try {
    const decode = await decodeVin(vin);
    return NextResponse.json({ decode, catalog: matchCatalog(decode) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // vPIC upstream / decode failures → 502 so the client shows a
    // "couldn't decode, use the dropdowns" fallback rather than a crash.
    return NextResponse.json(
      { error: "VIN decode failed", detail: message },
      { status: 502 }
    );
  }
});
