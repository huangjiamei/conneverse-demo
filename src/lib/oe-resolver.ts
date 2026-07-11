/**
 * Consensus OE resolver — the memo's bootstrap strategy: resolve OE
 * part numbers from marketplace listing consensus, with no licensed
 * catalog.
 *
 * Given (vehicle, partType, position), query eBay, read each listing's
 * OE / MPN aspects, and take the consensus: a number appearing across
 * many INDEPENDENT sellers outranks a singleton (which is likely a
 * typo, a cross-reference, or keyword stuffing). The persisted result
 * table compounds with usage — a core asset that improves as more
 * shops search.
 *
 * Server-only (getItem calls). Bounded getItem fan-out to respect the
 * eBay rate limit; results are cached in the DataStore so repeat
 * queries are free.
 */

import {
  searchEbayParts,
  getEbayItemAspects,
  type EbayItem,
} from "./ebay-search.ts";
import { store } from "./api/store.ts";
import type { Vehicle } from "@/types/canonical";

export type ConsensusOE = {
  /** Display form of the OE number, e.g. "04465-0E060". */
  oeNumber: string;
  /** Distinct sellers whose listing referenced this number. */
  sellerCount: number;
  /** 0..1 — sellerCount relative to how many listings we read. */
  confidence: number;
};

// Aspect names we trust as part-number sources. Interchange/Superseded
// are frequently keyword-stuffed, so we read them but lean on the
// strict token filter + cross-seller consensus to reject the noise.
const PART_NUMBER_ASPECTS =
  /oe\/oem part number|oem part number|oe part number|manufacturer part number|\bmpn\b|interchange part number/i;

// How many listings to read aspects for. Bounds getItem fan-out.
const MAX_ITEM_FETCHES = 12;
const SEARCH_LIMIT = 15;

/** Normalize an OE token for matching: uppercase, strip separators. */
function normalizeOe(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Does this token look like a real OE / MPN part number (not a word,
 * a year, or a spec like "2.5L")? Length 5–15, >= 3 digits, not a pure
 * 4-digit year.
 */
function looksLikeOe(token: string): boolean {
  const norm = normalizeOe(token);
  if (norm.length < 5 || norm.length > 15) return false;
  const digits = (norm.match(/\d/g) ?? []).length;
  // Real OE/MPN numbers carry >= 4 digits. This rejects trim/model
  // codes ("ES300H", "XSE") and specs ("2.5L") that get keyword-stuffed
  // into interchange aspect fields.
  if (digits < 4) return false;
  // Pure 4-digit year / bare number.
  if (/^\d{4}$/.test(norm)) return false;
  return true;
}

/** Extract candidate OE tokens from one listing's aspects. */
function extractOeTokens(aspects: { name: string; value: string }[]): Set<string> {
  const found = new Set<string>();
  for (const a of aspects) {
    if (!PART_NUMBER_ASPECTS.test(a.name)) continue;
    // Values can be comma/space-separated lists of numbers + noise.
    for (const tok of a.value.split(/[,\s;/]+/)) {
      if (looksLikeOe(tok)) found.add(normalizeOe(tok));
    }
  }
  return found;
}

/**
 * Cache key for a resolved part. Prefer the catalog partId when
 * available (exact + consistent between /api/resolve and /api/search),
 * otherwise a (platform, partType, position) composite for off-catalog
 * parts.
 */
export function oeConsensusKey(args: {
  partId?: string | null;
  vehicle: Vehicle;
  partType: string;
  position: string | null;
}): string {
  if (args.partId) return `part:${args.partId}`;
  return [
    args.vehicle.make.toLowerCase(),
    args.vehicle.model.toLowerCase(),
    args.partType.toLowerCase(),
    (args.position ?? "").toLowerCase(),
  ].join("|");
}

/**
 * Resolve consensus OE numbers. Returns cached results when present;
 * otherwise queries eBay, computes, persists, and returns. `[]` on any
 * failure — never throws into the resolve/search path.
 */
export async function resolveConsensusOE(args: {
  vehicle: Vehicle;
  partType: string;
  position: string | null;
  /** Catalog part id, when stocked — the preferred cache key. */
  partId?: string | null;
  /** Search keywords (usually the part-type label). */
  query: string;
}): Promise<ConsensusOE[]> {
  const key = oeConsensusKey({
    partId: args.partId,
    vehicle: args.vehicle,
    partType: args.partType,
    position: args.position,
  });

  const cached = store.getOeConsensus(key);
  if (cached) return cached;

  let items: EbayItem[];
  try {
    items = await searchEbayParts(args.query, {
      limit: SEARCH_LIMIT,
      vehicle: args.vehicle,
    });
  } catch {
    return [];
  }
  if (items.length === 0) return [];

  const toFetch = items.slice(0, MAX_ITEM_FETCHES);
  const aspectResults = await Promise.allSettled(
    toFetch.map((it) => getEbayItemAspects(it.itemId))
  );

  // Tally each normalized OE number by the DISTINCT sellers referencing
  // it. Keep a display form (first raw seen) per normalized token.
  const sellersByOe = new Map<string, Set<string>>();
  const displayByOe = new Map<string, string>();
  let listingsRead = 0;

  aspectResults.forEach((res, i) => {
    if (res.status !== "fulfilled") return;
    listingsRead++;
    const seller = toFetch[i].seller.username || `anon${i}`;
    const tokens = extractOeTokens(res.value);
    for (const norm of tokens) {
      if (!sellersByOe.has(norm)) sellersByOe.set(norm, new Set());
      sellersByOe.get(norm)!.add(seller);
      if (!displayByOe.has(norm)) {
        // Recover a readable form from the raw aspect if available.
        const raw = res.value
          .flatMap((a) => a.value.split(/[,\s;/]+/))
          .find((t) => normalizeOe(t) === norm);
        displayByOe.set(norm, raw ?? norm);
      }
    }
  });

  const denom = Math.max(1, listingsRead);
  const ranked: ConsensusOE[] = [...sellersByOe.entries()]
    .map(([norm, sellers]) => ({
      oeNumber: displayByOe.get(norm) ?? norm,
      sellerCount: sellers.size,
      confidence: Math.min(1, sellers.size / denom),
    }))
    // Keep numbers with any cross-seller agreement, plus the strongest
    // singletons — but rank consensus first.
    .filter((c) => c.sellerCount >= 1)
    .sort((a, b) => b.sellerCount - a.sellerCount)
    .slice(0, 5);

  store.saveOeConsensus(key, ranked, new Date().toISOString());
  return ranked;
}
