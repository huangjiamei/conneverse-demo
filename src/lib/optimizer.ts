/**
 * The optimizer v3 — demand-aware, two stages, in order:
 *
 *   Stage 1 — hard gates. Non-negotiable rules knock candidates out of
 *   the pool entirely (missing price/delivery, unverified fitment,
 *   reliability below floor, quality below floor, account-policy
 *   violations). A knocked-out part is unbuyable; no score buys it back.
 *
 *   Stage 2 — soft score. Survivors are ranked on a weighted
 *   multi-objective score across quality / price / delivery / fitment
 *   confidence, where the WEIGHTS DERIVE FROM CONTEXT:
 *     - on_lift heavily weights delivery — mid-repair, speed beats
 *       price (hard rule from customer research).
 *     - scheduled_week + big-ticket unlocks the slow-cheap wedge.
 *     - restoration relaxes delivery entirely.
 *     - safety-critical parts bump the reliability weight.
 *     - per-shop price sensitivity (learned from the override log)
 *       nudges the price weight.
 *
 *   Context, not knobs: users never see weights. The only per-search
 *   user input is the urgency toggle; everything else is derived
 *   (vehicleClass from the vehicle, partCriticality from the taxonomy,
 *   floors/brands from settings, accountPolicy from the admin screen).
 *
 *   Every weight lives in OPTIMIZER_WEIGHTS — v4 learns these from
 *   outcome data (returns/comebacks), so nothing is hardcoded inline.
 *
 * Reference: docs/reference/Conneverse_Source_Optimizer_Demo.html
 */

import { classifyGradeTier, TIER_RANK } from "@/lib/grade-tier";
import type { GradeTier } from "@/types/canonical";
import type { Offering, RejectionReason } from "./offerings/types";

// ─── Demand context ─────────────────────────────────────────────────

export type Urgency = "on_lift" | "scheduled_48h" | "scheduled_week";
export type JobType = "customer_pay" | "warranty" | "restoration";
export type VehicleClass = "economy" | "mainstream" | "luxury";
export type PartCriticality = "safety" | "mechanical" | "cosmetic";

/** Chain account policy — set on the admin-only screen; advisors never
 * see it. The optimizer silently enforces it and the debug panel logs
 * the hits. */
export type AccountPolicy = {
  /** Minimum grade tier per category ("Brakes" → premium_aftermarket). */
  tierFloorByCategory?: Record<string, GradeTier>;
  /** Hard per-line price cap. */
  priceCapPerLine?: number;
  /** Orders above this need manager approval (surfaced downstream). */
  approvalThreshold?: number;
};

export type DemandContext = {
  urgency: Urgency;
  jobType: JobType;
  vehicleClass: VehicleClass;
  partCriticality: PartCriticality;
  /** Base reliability floor, overridable per category. */
  qualityFloor: number;
  qualityFloorByCategory: Record<string, number>;
  preferredBrands: string[];
  accountPolicy?: AccountPolicy;
  consolidateSuppliers: boolean;
  /** The category being sourced (drives per-category floors/policy). */
  category?: string;
  /** Vehicle make (drives tier classification for policy checks). */
  vehicleMake?: string;
  /** Advisor's this-search-only tier preference (correction sheet). */
  tierPreference?: GradeTier;
  /** 0..1 — learned from the override log. 0.5 = neutral. */
  priceSensitivity?: number;
};

/** Fill defaults so callers can pass partial context. */
export function resolveDemandContext(
  partial: Partial<DemandContext>
): DemandContext {
  return {
    urgency: partial.urgency ?? "scheduled_48h",
    jobType: partial.jobType ?? "customer_pay",
    vehicleClass: partial.vehicleClass ?? "mainstream",
    partCriticality: partial.partCriticality ?? "mechanical",
    qualityFloor: partial.qualityFloor ?? 0.65,
    qualityFloorByCategory: partial.qualityFloorByCategory ?? {},
    preferredBrands: partial.preferredBrands ?? [],
    accountPolicy: partial.accountPolicy,
    consolidateSuppliers: partial.consolidateSuppliers ?? false,
    category: partial.category,
    vehicleMake: partial.vehicleMake,
    tierPreference: partial.tierPreference,
    priceSensitivity: partial.priceSensitivity ?? 0.5,
  };
}

// ─── Population rules (context, not knobs) ──────────────────────────

const LUXURY_MAKES = new Set(["bmw", "mercedes-benz", "audi", "lexus", "porsche"]);
const ECONOMY_MAKES = new Set(["mitsubishi", "suzuki"]);

export function deriveVehicleClass(make: string | undefined): VehicleClass {
  const m = (make ?? "").toLowerCase();
  if (LUXURY_MAKES.has(m)) return "luxury";
  if (ECONOMY_MAKES.has(m)) return "economy";
  return "mainstream";
}

/** partCriticality from the taxonomy's category grouping. */
const CATEGORY_CRITICALITY: Record<string, PartCriticality> = {
  Brakes: "safety",
  Suspension: "safety",
  Ignition: "mechanical",
  Cooling: "mechanical",
  Electrical: "mechanical",
  Filters: "mechanical",
  "Engine / Drivetrain": "mechanical",
  Exhaust: "mechanical",
  Lighting: "cosmetic",
  "Body / Collision": "cosmetic",
};

export function deriveCriticality(
  category: string | undefined
): PartCriticality {
  return CATEGORY_CRITICALITY[category ?? ""] ?? "mechanical";
}

// ─── Weights (ALL tunables live here — v4 learns these) ─────────────

export const OPTIMIZER_WEIGHTS = {
  /** Base multi-objective weights (sum ≈ 1). */
  base: { price: 0.35, reliability: 0.25, delivery: 0.3, fitment: 0.1 },
  /** Urgency reshapes price↔delivery. on_lift: speed beats price. */
  urgency: {
    on_lift: { price: 0.1, delivery: 0.55 },
    scheduled_48h: { price: 0.35, delivery: 0.3 },
    scheduled_week: { price: 0.5, delivery: 0.15 },
  } as Record<Urgency, { price: number; delivery: number }>,
  /** scheduled_week + big-ticket unlocks the slow-cheap wedge. */
  bigTicket: { threshold: 150, extraPriceWeight: 0.1 },
  /** restoration relaxes delivery entirely. */
  restorationDeliveryWeight: 0.02,
  /** Safety-critical parts weight reliability harder + raise the floor. */
  criticality: {
    safety: { reliabilityBonus: 0.1, floorBump: 0.05 },
    mechanical: { reliabilityBonus: 0, floorBump: 0 },
    cosmetic: { reliabilityBonus: -0.05, floorBump: -0.05 },
  } as Record<PartCriticality, { reliabilityBonus: number; floorBump: number }>,
  /** Luxury vehicles lean OEM/premium tiers. */
  vehicleClassTierBonus: {
    luxury: { oem_genuine: 0.08, premium_aftermarket: 0.04, value_aftermarket: 0 },
    mainstream: { oem_genuine: 0, premium_aftermarket: 0, value_aftermarket: 0 },
    economy: { oem_genuine: 0, premium_aftermarket: 0, value_aftermarket: 0.03 },
  } as Record<VehicleClass, Record<GradeTier, number>>,
  /** Shop-preferred brands get a nudge, never a gate. */
  preferredBrandBonus: 0.06,
  /** Advisor's this-search-only tier preference (correction sheet). */
  tierPreferenceBonus: 0.12,
  /** Price-sensitivity learning: weight shift at the extremes. */
  priceSensitivitySwing: 0.1,
  /** Fitment confidence by evidence source (all survivors are verified;
   * this grades HOW they were verified). */
  fitmentConfidence: { simulated: 1.0, local: 0.95, ebay: 0.85 } as Record<
    string,
    number
  >,
  /** Whole-RO consolidation: fewer suppliers is worth a small premium. */
  consolidation: { maxTotalCostDeltaPct: 0.08 },
  /** Per-dimension quality floor (reliability.quality). */
  qualityDimensionFloor: 0.55,
};

// ─── Recommendation types ───────────────────────────────────────────

export type GateLogEntry = {
  offeringId: string;
  sellerName: string;
  gate: RejectionReason;
};

export type ScoreBreakdown = {
  price: number;
  reliability: number;
  delivery: number;
  fitment: number;
  bonus: number;
};

export type Recommendation = {
  offering: Offering;
  role: "A" | "B" | "candidate";
  score: number;
  /** Dev-only decomposition — debug panel material, never client UI. */
  breakdown: ScoreBreakdown;
  gateLog: GateLogEntry[];
};

export type ResolvedWeights = {
  price: number;
  reliability: number;
  delivery: number;
  fitment: number;
};

// ─── Stage 1: hard gates ────────────────────────────────────────────

export function applyGates(
  candidates: Offering[],
  context: DemandContext
): { survivors: Offering[]; gateLog: GateLogEntry[]; policyHits: number } {
  const survivors: Offering[] = [];
  const gateLog: GateLogEntry[] = [];
  let policyHits = 0;

  const knockout = (o: Offering, gate: RejectionReason) =>
    gateLog.push({ offeringId: o.id, sellerName: o.sellerName, gate });

  // Per-category floor + criticality bump.
  const floorBump =
    OPTIMIZER_WEIGHTS.criticality[context.partCriticality].floorBump;
  const floor =
    (context.category != null
      ? context.qualityFloorByCategory[context.category]
      : undefined) ?? context.qualityFloor;
  const effectiveFloor = Math.min(0.95, Math.max(0.3, floor + floorBump));

  const policy = context.accountPolicy;
  const tierFloor =
    policy?.tierFloorByCategory && context.category
      ? policy.tierFloorByCategory[context.category]
      : undefined;

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
    if (o.reliability.composite < effectiveFloor) {
      knockout(o, "below_reliability_floor");
      continue;
    }
    if (o.reliability.quality < OPTIMIZER_WEIGHTS.qualityDimensionFloor) {
      knockout(o, "quality_too_low");
      continue;
    }
    // Account policy — silently enforced; the debug panel logs hits.
    if (tierFloor) {
      const tier = classifyGradeTier(o.brand, context.vehicleMake, o.condition);
      if (TIER_RANK[tier] < TIER_RANK[tierFloor]) {
        knockout(o, "policy_blocked");
        policyHits++;
        continue;
      }
    }
    if (policy?.priceCapPerLine != null && o.landedPrice > policy.priceCapPerLine) {
      knockout(o, "policy_blocked");
      policyHits++;
      continue;
    }
    survivors.push(o);
  }

  return { survivors, gateLog, policyHits };
}

// ─── Stage 2: context-derived weights + soft score ──────────────────

export function deriveWeights(
  context: DemandContext,
  candidates: Offering[]
): ResolvedWeights {
  const W = OPTIMIZER_WEIGHTS;
  let price = W.urgency[context.urgency].price;
  let delivery = W.urgency[context.urgency].delivery;
  let reliability =
    W.base.reliability +
    W.criticality[context.partCriticality].reliabilityBonus;
  const fitment = W.base.fitment;

  // restoration relaxes delivery entirely.
  if (context.jobType === "restoration") {
    delivery = W.restorationDeliveryWeight;
    price += 0.1;
  }

  // scheduled_week + big-ticket unlocks the slow-cheap wedge.
  const avgPrice =
    candidates.length > 0
      ? candidates.reduce((s, o) => s + o.landedPrice, 0) / candidates.length
      : 0;
  if (
    context.urgency === "scheduled_week" &&
    avgPrice >= W.bigTicket.threshold
  ) {
    price += W.bigTicket.extraPriceWeight;
  }

  // Per-shop price sensitivity learned from the override log
  // (0.5 = neutral; overrides that consistently picked cheaper push up).
  const sens = context.priceSensitivity ?? 0.5;
  price += (sens - 0.5) * 2 * W.priceSensitivitySwing;

  // Normalize to sum 1 for interpretable debug output.
  const sum = price + delivery + reliability + fitment;
  return {
    price: price / sum,
    delivery: delivery / sum,
    reliability: reliability / sum,
    fitment: fitment / sum,
  };
}

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
  survivors: Offering[],
  context: DemandContext,
  weights: ResolvedWeights
): Array<{ offering: Offering; score: number; breakdown: ScoreBreakdown }> {
  const W = OPTIMIZER_WEIGHTS;
  const priceNorm = normalize(survivors, (o) => o.landedPrice);
  const deliveryNorm = normalize(survivors, (o) => o.deliveryDays);

  const scored = survivors.map((o) => {
    const tier = classifyGradeTier(o.brand, context.vehicleMake, o.condition);
    const priceScore = weights.price * (1 - (priceNorm.get(o.id) ?? 0.5));
    const deliveryScore =
      weights.delivery * (1 - (deliveryNorm.get(o.id) ?? 0.5));
    const reliabilityScore = weights.reliability * o.reliability.composite;
    const fitmentScore =
      weights.fitment * (W.fitmentConfidence[o.channel] ?? 0.8);

    let bonus = W.vehicleClassTierBonus[context.vehicleClass][tier];
    if (o.brand && context.preferredBrands.includes(o.brand)) {
      bonus += W.preferredBrandBonus;
    }
    if (context.tierPreference && tier === context.tierPreference) {
      bonus += W.tierPreferenceBonus;
    }

    const breakdown: ScoreBreakdown = {
      price: priceScore,
      reliability: reliabilityScore,
      delivery: deliveryScore,
      fitment: fitmentScore,
      bonus,
    };
    return {
      offering: o,
      score:
        priceScore + deliveryScore + reliabilityScore + fitmentScore + bonus,
      breakdown,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ─── Role assignment ────────────────────────────────────────────────
//
// A = the machine's PRIMARY pick — argmax score under the context
//     weights. Under on_lift the delivery weight makes the fast option
//     win; under scheduled_week the cheap option can take the slot.
// B = the best COUNTERPART from the other side of the speed↔price
//     tradeoff, so the advisor always sees the alternative lane.

function assignRoles(
  ranked: Offering[]
): { a: Offering | null; b: Offering | null } {
  const a = ranked[0] ?? null;
  if (!a) return { a: null, b: null };

  const aFast = a.deliveryDays <= 1;
  const otherLane = ranked.filter(
    (o) => o.id !== a.id && (aFast ? o.deliveryDays > 1 : o.deliveryDays <= 1)
  );
  // Counterpart: top-scoring from the opposite lane; if the pool is
  // one-sided, the next-best overall.
  const b = otherLane[0] ?? ranked.find((o) => o.id !== a.id) ?? null;
  return { a, b };
}

// ─── Public API ─────────────────────────────────────────────────────

export function optimize(
  candidates: Offering[],
  context: Partial<DemandContext>
): Recommendation[] {
  const ctx = resolveDemandContext(context);
  const { survivors, gateLog } = applyGates(candidates, ctx);
  const weights = deriveWeights(ctx, survivors);
  const ranked = rank(survivors, ctx, weights);
  const { a, b } = assignRoles(ranked.map((r) => r.offering));

  return ranked.map(({ offering, score, breakdown }) => ({
    offering,
    role:
      offering.id === a?.id ? "A" : offering.id === b?.id ? "B" : "candidate",
    score,
    breakdown,
    gateLog,
  }));
}

// ─── Whole-RO consolidation ─────────────────────────────────────────

export type RoAssignment = {
  lineIndex: number;
  offering: Offering;
};

export type RoPlan = {
  assignments: RoAssignment[];
  totalCost: number;
  supplierCount: number;
  deliveryEvents: number;
};

/**
 * Whole-RO mode: given per-line candidate sets, consolidate to fewer
 * suppliers when the total-cost delta stays inside the configured
 * ceiling (fewer delivery events beats a few dollars).
 *
 * Baseline = each line's optimizer-best pick independently. Greedy
 * consolidation: rank sellers by (coverage, then cost of covering all
 * their coverable lines), assign lines to the best-covering seller
 * first, fall back per-line. Accept the consolidated plan only when
 * totalCost <= baseline * (1 + maxTotalCostDeltaPct).
 */
export function consolidateRo(
  lineCandidates: Offering[][],
  context: Partial<DemandContext>
): { independent: RoPlan; consolidated: RoPlan; accepted: boolean } {
  const ctx = resolveDemandContext(context);

  // Independent baseline: per-line optimizer pick.
  const perLineBest: RoAssignment[] = [];
  lineCandidates.forEach((candidates, lineIndex) => {
    const recs = optimize(candidates, ctx);
    const best = recs.find((r) => r.role === "A") ?? recs[0];
    if (best) perLineBest.push({ lineIndex, offering: best.offering });
  });
  const independent = planFromAssignments(perLineBest);

  // Seller coverage map (cheapest offer per seller per line).
  const bySeller = new Map<string, Map<number, Offering>>();
  lineCandidates.forEach((candidates, lineIndex) => {
    for (const o of candidates) {
      if (!bySeller.has(o.sellerId)) bySeller.set(o.sellerId, new Map());
      const lineMap = bySeller.get(o.sellerId)!;
      const current = lineMap.get(lineIndex);
      if (!current || o.landedPrice < current.landedPrice) {
        lineMap.set(lineIndex, o);
      }
    }
  });

  // Greedy: sellers by coverage desc, then total cost asc.
  const sellers = [...bySeller.entries()]
    .map(([sellerId, lines]) => ({
      sellerId,
      coverage: lines.size,
      cost: [...lines.values()].reduce((s, o) => s + o.landedPrice, 0),
      lines,
    }))
    .sort((x, y) => y.coverage - x.coverage || x.cost - y.cost);

  const assigned = new Map<number, Offering>();
  for (const seller of sellers) {
    for (const [lineIndex, offering] of seller.lines) {
      if (!assigned.has(lineIndex)) assigned.set(lineIndex, offering);
    }
    if (assigned.size === lineCandidates.length) break;
  }
  const consolidated = planFromAssignments(
    [...assigned.entries()].map(([lineIndex, offering]) => ({
      lineIndex,
      offering,
    }))
  );

  const accepted =
    consolidated.supplierCount < independent.supplierCount &&
    consolidated.totalCost <=
      independent.totalCost *
        (1 + OPTIMIZER_WEIGHTS.consolidation.maxTotalCostDeltaPct);

  return { independent, consolidated, accepted };
}

function planFromAssignments(assignments: RoAssignment[]): RoPlan {
  const sellers = new Set(assignments.map((a) => a.offering.sellerId));
  return {
    assignments: [...assignments].sort((a, b) => a.lineIndex - b.lineIndex),
    totalCost:
      Math.round(
        assignments.reduce((s, a) => s + a.offering.landedPrice, 0) * 100
      ) / 100,
    supplierCount: sellers.size,
    deliveryEvents: sellers.size,
  };
}
