/**
 * NHTSA vPIC VIN decoder.
 *
 * Free government API — no key required:
 *   https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json
 *
 * Decodes a VIN to year/make/model/trim/engine/body class, caches
 * responses in-process, and reconciles the result against the demo
 * parts catalog so /api/search can run when the vehicle is covered.
 *
 * Server-side: `decodeVin` calls the external API from the /api/vin
 * route. `isValidVinFormat` is a pure client-safe pre-check.
 */

import { VEHICLES } from "@/data/vehicles";

export type VinDecode = {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  bodyClass: string | null;
  /** false when vPIC flags a check-digit (9th position) mismatch. The
   * vehicle usually still decodes — surfaced as a soft warning. */
  checkDigitValid: boolean;
};

export type CatalogMatch = {
  make: string;
  model: string;
  year: number;
} | null;

/** ISO 3779 VIN: 17 chars, letters+digits, excluding I, O, Q. */
export function isValidVinFormat(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim());
}

function buildEngine(
  displacementL: string | undefined,
  cylinders: string | undefined
): string | null {
  const parts: string[] = [];
  if (displacementL) parts.push(`${displacementL}L`);
  if (cylinders) parts.push(`${cylinders}-cyl`);
  return parts.length > 0 ? parts.join(" ") : null;
}

const cache = new Map<string, VinDecode>();

type VpicResult = {
  ModelYear?: string;
  Make?: string;
  Model?: string;
  Trim?: string;
  DisplacementL?: string;
  EngineCylinders?: string;
  BodyClass?: string;
  ErrorCode?: string;
};

/**
 * Decode a VIN via vPIC. Throws on invalid format, network failure, or
 * a decode that yields no usable make/model (the route maps these to
 * clean error responses). A check-digit warning is NOT a failure — the
 * vehicle is returned with `checkDigitValid: false`.
 */
export async function decodeVin(vin: string): Promise<VinDecode> {
  const norm = vin.trim().toUpperCase();
  if (!isValidVinFormat(norm)) {
    throw new Error("Invalid VIN format (expected 17 characters, no I/O/Q).");
  }

  const cached = cache.get(norm);
  if (cached) return cached;

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${norm}?format=json`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`vPIC request failed (${res.status} ${res.statusText})`);
  }

  const data = (await res.json()) as { Results?: VpicResult[] };
  const r = data.Results?.[0] ?? {};

  if (!r.Make && !r.Model) {
    throw new Error("VIN could not be decoded — no vehicle data returned.");
  }

  // ErrorCode is a comma-separated list; "1" = check-digit mismatch.
  const errorCodes = String(r.ErrorCode ?? "").split(",").map((c) => c.trim());

  const decode: VinDecode = {
    vin: norm,
    year: r.ModelYear ? Number(r.ModelYear) : null,
    make: r.Make || null,
    model: r.Model || null,
    trim: r.Trim || null,
    engine: buildEngine(r.DisplacementL, r.EngineCylinders),
    bodyClass: r.BodyClass || null,
    checkDigitValid: !errorCodes.includes("1"),
  };

  cache.set(norm, decode);
  return decode;
}

/**
 * Reconcile a decode against the demo parts catalog. Returns the
 * canonical catalog { make, model, year } when the vehicle is covered
 * (case-insensitive make+model, year in range), else null — the UI then
 * shows the decoded identity but steers the user to the dropdowns.
 */
export function matchCatalog(decode: VinDecode): CatalogMatch {
  if (!decode.make || !decode.model || !decode.year) return null;

  const vehicle = VEHICLES.find(
    (v) =>
      v.make.toLowerCase() === decode.make!.toLowerCase() &&
      v.model.toLowerCase() === decode.model!.toLowerCase()
  );
  if (!vehicle || !vehicle.years.includes(decode.year)) return null;

  return { make: vehicle.make, model: vehicle.model, year: decode.year };
}
