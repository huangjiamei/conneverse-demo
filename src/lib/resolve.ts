/**
 * Resolution layer (front half) — free text → structured part request.
 *
 * Staged, per prime directive 2 (deterministic before LLM):
 *
 *   Stage 1 — normalize: lowercase, expand shorthand tokens (asy →
 *             assembly, serp → serpentine), extract position tokens
 *             (rt → right, lf → left front).
 *   Stage 2 — deterministic taxonomy match: token-overlap scoring
 *             against the fixed taxonomy's aliases. A strong match
 *             resolves without any LLM call.
 *   Stage 3 — LLM fallback (claude-haiku-4-5, constrained to the same
 *             taxonomy): only for input the deterministic matcher
 *             can't place. Unavailable/failed LLM degrades to "no
 *             match" → the UI falls back to guided selection.
 *
 * The result is always confirm-gated in the UI — never proceed on low
 * confidence without the user's ✓.
 */

import { getPartsForVehicle } from "@/data/parts-catalog";
import {
  GENERIC_TOKENS,
  PART_TAXONOMY,
  POSITION_ALIASES,
  TOKEN_EXPANSIONS,
  getTaxonomyEntry,
  type PartTaxonomyEntry,
} from "@/data/part-taxonomy";
import { llmResolve } from "@/lib/connectors/llm-resolver";
import type { Vehicle } from "@/types/canonical";

export type ResolveResult = {
  /** Taxonomy id of the matched part type, or null when unresolved. */
  taxonomyId: string | null;
  /** Display label ("Fender liner"), or null. */
  partType: string | null;
  /** Category grouping. */
  category: string | null;
  /** Position parsed from the text ("right", "left front"), or null. */
  position: string | null;
  /** OE numbers when the demo catalog stocks this part. */
  oeNumbers: string[];
  /** 0..1. Confirm-gate in the UI regardless — never auto-proceed. */
  confidence: number;
  /** Demo catalog part id for this vehicle, or null when not stocked. */
  partId: string | null;
  /** Which stage resolved it. */
  source: "deterministic" | "llm" | "none";
};

// ─── Stage 1: normalize ─────────────────────────────────────────────

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Split tokens into (position words, part-description tokens). */
function extractPosition(tokens: string[]): {
  position: string | null;
  rest: string[];
} {
  const positionWords: string[] = [];
  const rest: string[] = [];

  for (const token of tokens) {
    const alias = POSITION_ALIASES[token];
    if (alias) {
      for (const word of alias.split(" ")) {
        if (!positionWords.includes(word)) positionWords.push(word);
      }
    } else {
      rest.push(token);
    }
  }

  // Canonical order: side before axis ("left front", not "front left").
  const SIDE = ["left", "right", "driver", "passenger"];
  const AXIS = ["front", "rear", "upper", "lower"];
  const ordered = [
    ...SIDE.filter((w) => positionWords.includes(w)),
    ...AXIS.filter((w) => positionWords.includes(w)),
  ];

  return { position: ordered.length > 0 ? ordered.join(" ") : null, rest };
}

function expandTokens(tokens: string[]): string[] {
  return tokens.map((t) => TOKEN_EXPANSIONS[t] ?? t);
}

// ─── Stage 2: deterministic taxonomy match ──────────────────────────

/** Minimum score to accept a deterministic match. */
const DETERMINISTIC_THRESHOLD = 0.5;

function scoreAgainstEntry(
  queryTokens: string[],
  entry: PartTaxonomyEntry
): number {
  const candidates = [entry.label.toLowerCase(), ...entry.aliases];
  let best = 0;

  const querySet = new Set(queryTokens);
  for (const candidate of candidates) {
    const candidateTokens = tokenize(candidate);
    const candidateSet = new Set(candidateTokens);

    const overlap = candidateTokens.filter((t) => querySet.has(t));
    if (overlap.length === 0) continue;
    // A match must include at least one distinctive (non-generic) token.
    if (overlap.every((t) => GENERIC_TOKENS.has(t))) continue;

    const union = new Set([...querySet, ...candidateSet]).size;
    const jaccard = overlap.length / union;
    if (jaccard > best) best = jaccard;
  }
  return best;
}

function deterministicMatch(queryTokens: string[]): {
  entry: PartTaxonomyEntry;
  score: number;
} | null {
  if (queryTokens.length === 0) return null;

  let best: { entry: PartTaxonomyEntry; score: number } | null = null;
  for (const entry of PART_TAXONOMY) {
    const score = scoreAgainstEntry(queryTokens, entry);
    if (score > (best?.score ?? 0)) {
      best = { entry, score };
    }
  }

  if (!best || best.score < DETERMINISTIC_THRESHOLD) return null;
  return best;
}

// ─── Catalog reconciliation ─────────────────────────────────────────

function catalogPartFor(
  entry: PartTaxonomyEntry,
  position: string | null,
  vehicle: Vehicle
): { partId: string; oeNumber: string } | null {
  const ids = entry.catalogPartIds;
  if (!ids) return null;

  let partId: string | undefined;
  if (position?.includes("rear")) partId = ids.rear ?? ids.default;
  else if (position?.includes("front")) partId = ids.front ?? ids.default;
  else partId = ids.default ?? ids.front;
  if (!partId) return null;

  // Only claim a catalog part when it actually fits this vehicle.
  const parts = getPartsForVehicle(vehicle.make, vehicle.model, vehicle.year);
  const part = parts.find((p) => p.id === partId);
  if (!part) return null;

  return { partId: part.id, oeNumber: part.partNumber };
}

// ─── Public API ─────────────────────────────────────────────────────

const NO_MATCH: ResolveResult = {
  taxonomyId: null,
  partType: null,
  category: null,
  position: null,
  oeNumbers: [],
  confidence: 0,
  partId: null,
  source: "none",
};

export async function resolvePart(
  vehicle: Vehicle,
  freeText: string
): Promise<ResolveResult> {
  const query = freeText.trim();
  if (!query) return NO_MATCH;

  // Stage 1: normalize
  const { position, rest } = extractPosition(tokenize(query));
  const queryTokens = expandTokens(rest);

  // Stage 2: deterministic
  const match = deterministicMatch(queryTokens);
  if (match) {
    const catalog = catalogPartFor(match.entry, position, vehicle);
    return {
      taxonomyId: match.entry.id,
      partType: match.entry.label,
      category: match.entry.category,
      position,
      oeNumbers: catalog ? [catalog.oeNumber] : [],
      confidence: Math.min(1, Math.round(match.score * 100) / 100),
      partId: catalog?.partId ?? null,
      source: "deterministic",
    };
  }

  // Stage 3: LLM fallback (constrained to the same taxonomy)
  const llm = await llmResolve(query, vehicle);
  if (llm?.taxonomyId) {
    const entry = getTaxonomyEntry(llm.taxonomyId);
    if (entry) {
      const finalPosition = position ?? llm.position;
      const catalog = catalogPartFor(entry, finalPosition, vehicle);
      return {
        taxonomyId: entry.id,
        partType: entry.label,
        category: entry.category,
        position: finalPosition,
        oeNumbers: catalog ? [catalog.oeNumber] : [],
        confidence: llm.confidence,
        partId: catalog?.partId ?? null,
        source: "llm",
      };
    }
  }

  // Unresolved — the UI degrades to guided category selection.
  return { ...NO_MATCH, position };
}
