/**
 * Resolution layer (front half) — simulated for now.
 *
 * Maps a free-text part request to a structured { partType, position,
 * oeNumbers, confidence } by matching against the catalog for the given
 * vehicle. Prompt 3 replaces the matcher with an LLM normalizer + a
 * consensus OE resolver; the interface stays the same.
 */

import { getPartsForVehicle } from "@/data/parts-catalog";
import type { Vehicle } from "@/types/canonical";

export type ResolveResult = {
  partType: string | null;
  position: string | null;
  oeNumbers: string[];
  confidence: number;
  /** The catalog part id we matched, so /api/search can look it up. */
  partId: string | null;
};

const POSITION_TOKENS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(front|frt|fr|f)\b/i, label: "front" },
  { re: /\b(rear|rr|r)\b/i, label: "rear" },
  { re: /\b(left|lh|lf|lt|l)\b/i, label: "left" },
  { re: /\b(right|rh|rf|rt)\b/i, label: "right" },
  { re: /\b(upper|up)\b/i, label: "upper" },
  { re: /\b(lower|low)\b/i, label: "lower" },
  { re: /\b(driver)\b/i, label: "driver" },
  { re: /\b(passenger|pass)\b/i, label: "passenger" },
];

function parsePosition(text: string): string | null {
  const hits = POSITION_TOKENS.filter((p) => p.re.test(text)).map(
    (p) => p.label
  );
  return hits.length > 0 ? hits.join(" ") : null;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function resolvePart(
  vehicle: Vehicle,
  freeText: string
): ResolveResult {
  const query = freeText.trim();
  if (!query) {
    return { partType: null, position: null, oeNumbers: [], confidence: 0, partId: null };
  }

  const parts = getPartsForVehicle(
    vehicle.make,
    vehicle.model,
    vehicle.year
  );
  const qTokens = new Set(tokenize(query));

  let best: { partId: string; category: string; oe: string; score: number } | null =
    null;

  for (const p of parts) {
    const nameTokens = tokenize(p.name);
    const overlap = nameTokens.filter((t) => qTokens.has(t)).length;
    if (overlap === 0) continue;
    // Jaccard-ish: overlap normalized by the part's token count.
    const score = overlap / nameTokens.length;
    if (!best || score > best.score) {
      best = {
        partId: p.id,
        category: p.category,
        oe: p.partNumber,
        score,
      };
    }
  }

  if (!best) {
    return {
      partType: null,
      position: parsePosition(query),
      oeNumbers: [],
      confidence: 0,
      partId: null,
    };
  }

  return {
    partType: best.category,
    position: parsePosition(query),
    oeNumbers: [best.oe],
    confidence: Math.min(1, Math.round(best.score * 100) / 100),
    partId: best.partId,
  };
}
