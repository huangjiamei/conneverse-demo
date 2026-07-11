/**
 * Channel-agnostic Offering type — the unit the aggregator operates on.
 *
 * Every source (simulated suppliers, eBay, future Amazon / local
 * distributors / DTC) is normalized to an Offering before scoring.
 * `resolveOptions()` picks Option A and Option B from a list of these,
 * irrespective of which channel they came from.
 */

export type Channel =
  | "simulated"
  | "ebay"
  | "amazon"
  | "local"
  | "dtc"
  | "oem";

export type Condition = "new" | "refurbished" | "used" | "unknown";

/**
 * The composite reliability score for a seller — what makes a 99% eBay
 * merchant comparable to a local distributor. Every dimension is in
 * 0..1 except `curation` which is a manual ±0.3 overlay.
 *
 * For sellers without first-party Conneverse data, the dimensions are
 * inferred from marketplace signals with a provisional discount.
 */
export type ReliabilityBreakdown = {
  /** Order ships at all + on time. 0..1 */
  fulfillment: number;
  /** No defects, no fitment disputes, no wrong-part returns. 0..1 */
  quality: number;
  /** Shops re-order; first-party NPS proxy. 0..1 */
  loyalty: number;
  /** External signals: eBay feedback %, Amazon stars, etc. 0..1 */
  marketplace: number;
  /** Manual Conneverse overlay. -0.3 to +0.3 */
  curation: number;
  /** Rolled-up score actually used for ranking. 0..1 */
  composite: number;
  /** True until this seller has enough Conneverse-routed orders. */
  provisional: boolean;
  /** Volume of evidence behind the score (review count / order count). */
  sampleSize: number;
};

export type Offering = {
  /** Stable unique id, prefixed by channel. */
  id: string;
  channel: Channel;
  /** Human-readable channel label for the UI: "Acme Local · 4.8★". */
  channelLabel: string;

  /** Canonical seller id across listings (a seller may have N offerings). */
  sellerId: string;
  sellerName: string;

  // ─── What you're buying ───
  partName: string;
  /** Manufacturer part number for simulated, eBay itemId for marketplace. */
  partNumber: string;
  brand: string | null;
  condition: Condition;

  // ─── Money ───
  itemPrice: number;
  shippingCost: number;
  /** itemPrice + shippingCost. Used for price comparisons. */
  landedPrice: number;
  currency: string;
  /** Units in the listing (a "set of 4" is 4). Prices above are already
   * normalized to per-unit so a pair's price is never compared to a
   * single. */
  qtyIncluded: number;

  // ─── When ───
  /** Days from now until earliest delivery. 0 = today, 1 = tomorrow. */
  deliveryDays: number;
  deliveryLabel: string;

  // ─── Trust ───
  reliability: ReliabilityBreakdown;
  /** Whether fitment is verified for the targeted vehicle. */
  fitmentVerified: boolean;
  warrantyDays: number | null;
  returnsAccepted: boolean;

  // ─── Provenance ───
  /** External link for marketplace listings; null for synthetic sources. */
  sourceUrl: string | null;
};

/**
 * Reasons an offering can be rejected by the hard filters. Tracking
 * these by count gives the funnel-header copy real numbers and helps
 * us debug why a search returned no results.
 */
export type RejectionReason =
  | "out_of_stock"
  | "not_fitment_verified"
  | "below_reliability_floor"
  | "quality_too_low"
  | "missing_price"
  | "missing_delivery";

/**
 * Reasons a raw marketplace candidate is rejected by the guardrails —
 * the hard filters that run BEFORE any candidate reaches the optimizer.
 * Distinct from RejectionReason (which is the optimizer's reliability/
 * fitment gates on already-normalized offerings).
 */
export type GuardrailReason =
  | "oe_family_mismatch"
  | "wrong_platform"
  | "universal_or_accessory"
  | "junk_price"
  | "placeholder_part_number"
  | "used_or_refurb_segmented";

export type AggregateResult = {
  optionA: Offering | null;
  optionB: Offering | null;
  meta: {
    /** Channels actually queried (excluding stubs that returned []). */
    channelsSearched: Channel[];
    /** Total offerings collected before filters. */
    totalConsidered: number;
    /** Offerings that passed all hard filters. */
    totalAfterFilters: number;
    /** Why the rejected ones were rejected (optimizer gates). */
    rejections: Record<RejectionReason, number>;
    /** Guardrail rejections (pre-optimizer, marketplace-listing filters). */
    guardrailRejections: Record<GuardrailReason, number>;
    /** How the marketplace connector matched: OE hard-match or keyword. */
    matchStrategy: "oe_hard" | "keyword";
    /** Consensus OE numbers used for the hard match, if any. */
    oeNumbers: string[];
    /** Wall-clock duration of the aggregation. */
    durationMs: number;
  };
};
