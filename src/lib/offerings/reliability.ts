/**
 * Reliability scoring. Channel-agnostic — every offering computes its
 * composite score the same way.
 *
 * Formula:
 *   base = 0.35*fulfillment + 0.30*quality + 0.20*loyalty + 0.15*marketplace
 *   composite = clamp(base + curation, 0, 1)
 *
 * Sellers without first-party Conneverse data are flagged `provisional`
 * and their fulfillment/quality/loyalty are discounted from the
 * marketplace signal (we don't fully trust eBay feedback % as a proxy
 * for actual repair-shop outcomes until we've seen real orders).
 */

import type { ReliabilityBreakdown } from "./types.ts";

// ─── Weights (tunable) ───
const W_FULFILLMENT = 0.35;
const W_QUALITY = 0.30;
const W_LOYALTY = 0.20;
const W_MARKETPLACE = 0.15;

// Discount applied to provisional sellers' fulfillment/quality/loyalty.
// 0.85 means even a 100% feedback eBay seller maxes out at ~0.85 on
// those dimensions until they've completed Conneverse-routed orders.
const PROVISIONAL_DISCOUNT = 0.85;

/**
 * Manual curation overlay. Apply ±0.3 boost or penalty to specific
 * sellers based on Conneverse's brand knowledge. Keyed by either:
 *   - "sim:<supplier-id>" for simulated suppliers
 *   - "ebay:<seller-username>" for eBay merchants
 *
 * In production this lives in a database. For the demo it lives here.
 */
export const SELLER_CURATION: Record<string, number> = {
  // Simulated trusted distributors — small positive boost.
  "sim:metro-parts": 0.05,
  "sim:national-auto": 0.03,
  "sim:proparts": 0.02,
  "sim:valueparts": 0.0,

  // Known eBay sellers (seeded from demo searches). Real overlay
  // would be populated by the Conneverse ops team over time.
  "ebay:topbrakerotors": 0.02,
  "ebay:toyotabrakepads": 0.01,
};

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Compute the composite score from the breakdown components. The
 * returned breakdown has `composite` populated.
 */
export function composeReliability(
  partial: Omit<ReliabilityBreakdown, "composite">
): ReliabilityBreakdown {
  const base =
    W_FULFILLMENT * partial.fulfillment +
    W_QUALITY * partial.quality +
    W_LOYALTY * partial.loyalty +
    W_MARKETPLACE * partial.marketplace;
  const composite = clamp(base + partial.curation, 0, 1);
  return { ...partial, composite };
}

/**
 * Reliability for a simulated, Conneverse-vetted supplier. These are
 * NOT provisional — they're hand-curated and trusted by default. The
 * base score comes from the supplier's per-category star rating.
 */
export function reliabilityFromSimulated(args: {
  supplierId: string;
  categoryScore: number; // 1-5
  reviewCount: number;
}): ReliabilityBreakdown {
  const base = clamp(args.categoryScore / 5, 0, 1);
  const curation = SELLER_CURATION[`sim:${args.supplierId}`] ?? 0;
  return composeReliability({
    fulfillment: clamp(base + 0.02, 0, 1),
    quality: clamp(base - 0.02, 0, 1),
    loyalty: clamp(base, 0, 1),
    marketplace: base,
    curation,
    provisional: false,
    sampleSize: args.reviewCount,
  });
}

/**
 * Reliability for an eBay marketplace seller. Provisional until they
 * accrue first-party Conneverse order data. Fulfillment/quality/loyalty
 * are inferred from marketplace feedback with a provisional discount.
 */
export function reliabilityFromEbay(args: {
  sellerUsername: string;
  /** eBay feedback percentage 0-100, or null if unknown. */
  feedbackPercentage: number | null;
  /** eBay total feedback count, or null if unknown. */
  feedbackScore: number | null;
}): ReliabilityBreakdown {
  const marketplace =
    args.feedbackPercentage != null ? args.feedbackPercentage / 100 : 0.5;

  // Dimension-specific discounts reflect uncertainty about each:
  //   fulfillment is closest to what eBay measures
  //   quality is harder to infer from eBay feedback
  //   loyalty has no marketplace proxy at all
  const fulfillment = marketplace * PROVISIONAL_DISCOUNT;
  const quality = marketplace * 0.95 * PROVISIONAL_DISCOUNT;
  const loyalty = marketplace * 0.85 * PROVISIONAL_DISCOUNT;

  const curation = SELLER_CURATION[`ebay:${args.sellerUsername}`] ?? 0;

  return composeReliability({
    fulfillment,
    quality,
    loyalty,
    marketplace,
    curation,
    provisional: true,
    sampleSize: args.feedbackScore ?? 0,
  });
}
