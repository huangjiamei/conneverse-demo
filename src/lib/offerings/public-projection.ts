/**
 * Public projection — the anti-scraping boundary.
 *
 * Maps an internal `Offering` (server-only, carries seller identity and
 * numeric reliability) to a `PublicOffer` (client-facing, no seller /
 * channel identity, quality expressed as a grade tier). Everything the
 * client receives passes through here.
 *
 * Directives enforced here:
 *   6 — supplier anonymization: sellerId/sellerName/channel/sourceUrl
 *       are dropped. Attribution becomes "Fulfilled by Conneverse".
 *   7 — no numeric quality scores: reliability.composite becomes a
 *       grade tier badge; the number stays server-side.
 */

import { createHash } from "crypto";
import { store } from "@/lib/api/store";
import { classifyGradeTier } from "@/lib/grade-tier";
import type {
  MarketBaseline,
  PublicOffer,
  PublicSearchResult,
} from "@/types/canonical";
import type { AggregateResult, Offering } from "./types";

// ─── Grade-tier classification ──────────────────────────────────────

// Grade-tier classification lives in src/lib/grade-tier.ts (shared
// with the optimizer). Re-exported for existing importers.
export { classifyGradeTier } from "@/lib/grade-tier";

// ─── Warranty term formatting ───────────────────────────────────────

function warrantyLabel(offering: Offering): string {
  if (offering.warrantyDays != null) {
    return offering.warrantyDays >= 30
      ? `${Math.round(offering.warrantyDays / 30)} mo warranty`
      : `${offering.warrantyDays} day warranty`;
  }
  return offering.condition === "new" ? "Seller warranty" : "As-is";
}

// ─── Opaque id ──────────────────────────────────────────────────────

/** Non-reversible token derived from the internal id. Stable per offer
 * (so quote dedup works) but reveals no seller/channel identity. */
function opaqueId(internalId: string): string {
  return (
    "po_" +
    createHash("sha256").update(internalId).digest("base64url").slice(0, 16)
  );
}

// ─── Guarantees ─────────────────────────────────────────────────────

// Uniform Conneverse guarantee set. Because every pick is "Fulfilled by
// Conneverse", the guarantees are the same across options — this both
// tells the correct story (Conneverse stands behind both) and avoids
// leaking that one option came from a marketplace.
const CONNEVERSE_GUARANTEES = [
  "Fitment Verified",
  "Price Locked",
  "Delivery SLA",
  "30-Day Returns",
];

// ─── Fitment evidence / return terms (anonymized labels) ────────────

function fitmentEvidenceLabel(offering: Offering): string {
  if (!offering.fitmentVerified) return "Fitment not verified";
  switch (offering.channel) {
    case "ebay":
      return "Marketplace compatibility table for this vehicle";
    case "local":
      return "Confirmed by Conneverse ops on the phone";
    default:
      return "Distributor catalog fitment";
  }
}

function returnTermsLabel(offering: Offering): string {
  if (!offering.returnsAccepted) return "No returns";
  return offering.channel === "simulated"
    ? "30-day returns, Conneverse-backed"
    : "Returns accepted — Conneverse-backed";
}

/**
 * Media rule: a marketplace listing photo may render ONLY after an
 * internal reviewer approved it (photos can leak seller identity —
 * watermarks, packaging, storefront branding). Unseen photos are
 * enqueued as pending and withheld; rejected photos are withheld
 * forever. Catalog channels return null (UI uses stock imagery).
 */
function curatedPhotoUrl(offering: Offering): string | null {
  if (!offering.imageUrl) return null;
  const entry = store.ensurePhoto(
    offering.imageUrl,
    offering.partName,
    new Date().toISOString()
  );
  return entry.status === "approved" ? entry.url : null;
}

/**
 * The market_snapshot savings baseline: the incumbent-channel
 * (simulated local-distributor) alternative for the same part in this
 * SAME search. Like-for-like enforced — same condition, same grade tier
 * — and conservative: the CHEAPEST qualifying incumbent price. When no
 * same-tier incumbent exists, the cheapest same-condition incumbent is
 * returned with its own tier so order placement records the delta as a
 * tier choice, never as savings.
 */
export function computeMarketBaseline(
  offering: Offering,
  allCandidates: Offering[],
  make: string | undefined
): MarketBaseline | null {
  const tier = classifyGradeTier(offering.brand, make, offering.condition);
  const incumbents = allCandidates.filter(
    (o) =>
      o.channel === "simulated" &&
      o.id !== offering.id &&
      o.condition === offering.condition
  );
  if (incumbents.length === 0) return null;

  const withTier = incumbents.map((o) => ({
    o,
    tier: classifyGradeTier(o.brand, make, o.condition),
  }));
  const sameTier = withTier.filter((x) => x.tier === tier);
  const pool = sameTier.length > 0 ? sameTier : withTier;
  const cheapest = pool.reduce((min, x) =>
    x.o.landedPrice < min.o.landedPrice ? x : min
  );

  return {
    price: cheapest.o.landedPrice,
    gradeTier: cheapest.tier,
    condition: cheapest.o.condition,
    capturedAt: new Date().toISOString(),
  };
}

// ─── Projection ─────────────────────────────────────────────────────

export function toPublicOffer(
  offering: Offering,
  role: "A" | "B" | "candidate",
  make: string | undefined,
  marketBaseline: MarketBaseline | null = null
): PublicOffer {
  const publicId = opaqueId(offering.id);
  // Index the opaque id → seller mapping so order placement can group
  // lines per supplier server-side without exposing seller identity.
  store.registerOffer(publicId, offering.sellerId, offering.channel);
  return {
    id: publicId,
    role,
    // Data-driven pick label: "Ready Now" only when the pick is
    // actually fast — a slow-cheap primary reads "Best Price".
    pickLabel:
      role === "candidate"
        ? null
        : offering.deliveryDays <= 1
        ? "Ready Now"
        : "Best Price",
    partName: offering.partName,
    partNumber: offering.partNumber,
    brand: offering.brand,
    condition: offering.condition,
    gradeTier: classifyGradeTier(offering.brand, make, offering.condition),
    warranty: warrantyLabel(offering),
    price: offering.landedPrice,
    shippingCost: offering.shippingCost,
    currency: offering.currency,
    deliveryEstimate: {
      label: offering.deliveryLabel,
      days: offering.deliveryDays,
    },
    guarantees: CONNEVERSE_GUARANTEES,
    fitmentVerified: offering.fitmentVerified,
    fitmentEvidence: fitmentEvidenceLabel(offering),
    returnsAccepted: offering.returnsAccepted,
    returnTerms: returnTermsLabel(offering),
    photoUrl: curatedPhotoUrl(offering),
    provisional: offering.reliability.provisional,
    marketBaseline,
  };
}

/**
 * Pair-aware pick labels. The naive per-offer rule can hand BOTH picks
 * "Ready Now" (two fast options) — but the two cards must communicate
 * what each pick is FOR:
 *
 *   A fast, B cheaper        → Ready Now / Best Price   (classic)
 *   A slow-cheap, B faster   → Best Price / Ready Now   (wedge flip)
 *   B neither faster nor
 *   cheaper (next-best fill) → A by its own speed, B null
 *                              (UI renders a neutral "Also qualified")
 */
function pickLabels(
  a: Offering | null,
  b: Offering | null
): {
  a: "Ready Now" | "Best Price" | null;
  b: "Ready Now" | "Best Price" | null;
} {
  if (!a) {
    return {
      a: null,
      b: b ? (b.deliveryDays <= 1 ? "Ready Now" : "Best Price") : null,
    };
  }
  const ownSpeed = (o: Offering): "Ready Now" | "Best Price" =>
    o.deliveryDays <= 1 ? "Ready Now" : "Best Price";
  if (b) {
    const bFaster = b.deliveryDays < a.deliveryDays;
    const bCheaper = b.landedPrice < a.landedPrice;
    if (bFaster && !bCheaper) {
      // B is the speed counterpart; A won on price (the wedge).
      return { a: "Best Price", b: "Ready Now" };
    }
    if (bCheaper && !bFaster) {
      // Classic: A is the speed pick, B the price alternative.
      return { a: "Ready Now", b: "Best Price" };
    }
    // B dominated (or dominates on both axes — rare, reliability kept A
    // on top): label A by its own speed; B stays distinct or neutral.
    const aLabel = ownSpeed(a);
    return {
      a: aLabel,
      b: bCheaper && aLabel !== "Best Price" ? "Best Price" : null,
    };
  }
  return { a: ownSpeed(a), b: null };
}

/** Project a full internal aggregate result to the client-facing
 * search result. Channel NAMES are dropped — only a count crosses.
 * `includeDebug` attaches rejection counts (dev-only; the route sets it
 * from NODE_ENV). Counts carry no seller identity. */
export function toPublicSearchResult(
  result: AggregateResult,
  make: string | undefined,
  includeDebug = false
): PublicSearchResult {
  const belowBar =
    result.meta.totalConsidered - result.meta.totalAfterFilters;

  // Wire cap: the grid shows 7 (picks pinned + next 5 by score) with an
  // "N more" expander beyond — so ship enough survivors for the
  // expander to mean something.
  const GRID_CAP = 21;
  const roleFor = (o: Offering): "A" | "B" | "candidate" =>
    o.id === result.optionA?.id
      ? "A"
      : o.id === result.optionB?.id
      ? "B"
      : "candidate";
  const baselineFor = (o: Offering) =>
    computeMarketBaseline(o, result.candidates, make);
  const candidates = result.candidates
    .slice(0, GRID_CAP)
    .map((o) => toPublicOffer(o, roleFor(o), make, baselineFor(o)));

  // Pair-aware labels override the naive per-offer heuristic, on the
  // pick objects and their twins in the candidates grid (same ids).
  const labels = pickLabels(result.optionA, result.optionB);
  const optionA = result.optionA
    ? toPublicOffer(result.optionA, "A", make, baselineFor(result.optionA))
    : null;
  const optionB = result.optionB
    ? toPublicOffer(result.optionB, "B", make, baselineFor(result.optionB))
    : null;
  if (optionA) optionA.pickLabel = labels.a;
  if (optionB) optionB.pickLabel = labels.b;
  for (const c of candidates) {
    if (c.role === "A") c.pickLabel = labels.a;
    if (c.role === "B") c.pickLabel = labels.b;
  }

  const projected: PublicSearchResult = {
    optionA,
    optionB,
    candidates,
    meta: {
      considered: result.meta.totalConsidered,
      metQualityBar: result.meta.totalAfterFilters,
      belowBar,
      sourcesSearched: result.meta.channelsSearched.length,
      durationMs: result.meta.durationMs,
      assumption: result.meta.assumption,
    },
  };
  if (includeDebug) {
    projected.debug = {
      guardrailRejections: result.meta.guardrailRejections,
      gateRejections: result.meta.rejections,
      matchStrategy: result.meta.matchStrategy,
      oeNumbers: result.meta.oeNumbers,
      weights: result.meta.weights,
      policyHits: result.meta.policyHits,
      scores: result.meta.scores,
    };
  }
  return projected;
}
