/**
 * The optimizer — two stages, in order:
 *
 *   Stage 1 — hard gates. Non-negotiable rules knock candidates out of
 *   the pool entirely (missing price/delivery, unverified fitment,
 *   reliability below floor, quality below floor). A knocked-out part
 *   is unbuyable; no score can bring it back.
 *
 *   Stage 2 — soft score. Only the survivors are ranked, on a weighted
 *   price × reliability × delivery score.
 *
 * This structure fixes the flaw in a single weighted sum, where a low
 * price could "buy back" an unbuyable or ill-fitting part.
 * Reference: docs/reference/Conneverse_Source_Optimizer_Demo.html
 *
 * `DemandContext` is deliberately wider than today's logic needs —
 * urgency-aware weighting lands in a later prompt without changing
 * this interface.
 */

import type { Offering, RejectionReason } from "./offerings/types";

export type DemandContext = {
  urgency: "on_lift" | "scheduled";
  /** Reliability-composite floor. Strict mode: 0.65. */
  qualityFloor: number;
};

/** One knockout: which offering a gate removed, and why. Internal
 * only — gate logs power the debug panel and must never appear in
 * client-facing API responses. */
export type GateLogEntry = {
  offeringId: string;
  sellerName: string;
  gate: RejectionReason;
};

export type Recommendation = {
  offering: Offering;
  /** "A" = Ready Now pick, "B" = Best Price pick, else a ranked survivor. */
  role: "A" | "B" | "candidate";
  /** Soft score used for ranking. Higher is better. */
  score: number;
  /** The run's knockout log (same array on every recommendation). */
  gateLog: GateLogEntry[];
};

// ─── Stage 2 weights ────────────────────────────────────────────────

const RANK_PRICE_WEIGHT = -0.5; // cheaper better
const RANK_RELIABILITY_WEIGHT = 0.3; // more reliable better
const RANK_DELIVERY_WEIGHT = -0.2; // faster better

/** Per-dimension quality floor (reliability.quality), below which a
 * seller is gated regardless of composite. */
const QUALITY_FLOOR = 0.55;

// ─── Stage 1: hard gates ────────────────────────────────────────────

export function applyGates(
  candidates: Offering[],
  context: DemandContext
): { survivors: Offering[]; gateLog: GateLogEntry[] } {
  const survivors: Offering[] = [];
  const gateLog: GateLogEntry[] = [];

  const knockout = (o: Offering, gate: RejectionReason) =>
    gateLog.push({ offeringId: o.id, sellerName: o.sellerName, gate });

  for (const o of candidates) {
    if (!Number.isFinite(o.landedPrice) || o.landedPrice <= 0) {
      knockout(o, "missing_price");
      continue;
    }
    if (!Number.isFinite(o.deliveryDays)) {
      knockout(o, "missing_delivery");
      continue;
    }
    if (!o.fitmentVerified) {
      knockout(o, "not_fitment_verified");
      continue;
    }
    if (o.reliability.composite < context.qualityFloor) {
      knockout(o, "below_reliability_floor");
      continue;
    }
    if (o.reliability.quality < QUALITY_FLOOR) {
      knockout(o, "quality_too_low");
      continue;
    }
    survivors.push(o);
  }

  return { survivors, gateLog };
}

// ─── Stage 2: soft score ────────────────────────────────────────────

/** Normalize a numeric dimension across the candidate set to 0..1. */
function normalize(
  offerings: Offering[],
  value: (o: Offering) => number
): Map<string, number> {
  if (offerings.length === 0) return new Map();
  const values = offerings.map(value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return new Map(offerings.map((o) => [o.id, (value(o) - min) / range]));
}

function rank(
  survivors: Offering[]
): Array<{ offering: Offering; score: number }> {
  const priceNorm = normalize(survivors, (o) => o.landedPrice);
  const deliveryNorm = normalize(survivors, (o) => o.deliveryDays);

  const scored = survivors.map((o) => ({
    offering: o,
    score:
      RANK_PRICE_WEIGHT * (priceNorm.get(o.id) ?? 0.5) +
      RANK_RELIABILITY_WEIGHT * o.reliability.composite +
      RANK_DELIVERY_WEIGHT * (deliveryNorm.get(o.id) ?? 0.5),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ─── Role assignment ────────────────────────────────────────────────
//
//   Option A — "Ready Now": highest-scoring survivor with delivery <= 1 day.
//   Option B — "Best Price": among the rest (preferring the slower
//              bucket), the cheapest survivor that clears the
//              reliability floor.

function assignRoles(
  ranked: Offering[],
  context: DemandContext
): { a: Offering | null; b: Offering | null } {
  const a = ranked.find((o) => o.deliveryDays <= 1) ?? null;
  const rest = a ? ranked.filter((o) => o.id !== a.id) : ranked;

  const slower = rest.filter((o) => o.deliveryDays > 1);
  const pool = slower.length > 0 ? slower : rest;
  const qualified = pool.filter(
    (o) => o.reliability.composite >= context.qualityFloor
  );
  const sortedByPrice = [...qualified].sort(
    (x, y) => x.landedPrice - y.landedPrice
  );
  const b = sortedByPrice[0] ?? null;

  return { a, b };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Gate, score, and rank the candidates. Returns one Recommendation per
 * survivor, ranked best-first, with roles A/B assigned. Empty array if
 * nothing passes the gates.
 */
export function optimize(
  candidates: Offering[],
  context: DemandContext
): Recommendation[] {
  const { survivors, gateLog } = applyGates(candidates, context);
  const ranked = rank(survivors);
  const { a, b } = assignRoles(
    ranked.map((r) => r.offering),
    context
  );

  return ranked.map(({ offering, score }) => ({
    offering,
    role:
      offering.id === a?.id ? "A" : offering.id === b?.id ? "B" : "candidate",
    score,
    gateLog,
  }));
}
