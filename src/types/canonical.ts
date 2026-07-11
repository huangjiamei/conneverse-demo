/**
 * Canonical schema — the formal contract between the shells (standalone
 * app, embeddable SMS panel, headless API) and the core.
 *
 * These types are what the future SMS/host adapters (Prompt 7) and any
 * real supplier connectors (Prompt 4) translate INTO. They are the
 * stable vocabulary; internal implementation types (e.g. the
 * aggregator's `Offering`) map onto them at the API boundary.
 *
 * Two Offer shapes exist by design (anti-scraping):
 *   - `Offer`        — SERVER-ONLY. Carries sellerId, sellerType, and the
 *                      source url. Never leaves the server.
 *   - `PublicOffer`  — CLIENT-FACING. Everything the UI needs to render a
 *                      card, with NO seller/channel identity and NO
 *                      numeric quality score (directives 6 & 7). The only
 *                      attribution is "Fulfilled by Conneverse".
 */

// ─── Vehicle & repair order ─────────────────────────────────────────

export type Vehicle = {
  vin?: string;
  year: number;
  make: string;
  model: string;
  submodel?: string;
  engine?: string;
};

export type PartLine = {
  description: string;
  partType?: string;
  position?: string;
  oeNumber?: string;
  qty: number;
};

export type RepairOrder = {
  id: string;
  vehicle: Vehicle;
  lines: PartLine[];
};

// ─── Offers ─────────────────────────────────────────────────────────

export type OfferCondition = "new" | "used";

export type SellerType =
  | "local_distributor"
  | "national_chain"
  | "marketplace"
  | "dtc"
  | "oem_dealer";

export type QualitySignals = {
  /** Continuous 0..1 reliability composite — SERVER-ONLY, used for
   * ranking, floor enforcement, and debug panels. Never serialized to a
   * client. */
  reliability: number;
  rating?: number;
  reviewCount?: number;
  provisional: boolean;
};

export type FitmentEvidence = {
  verified: boolean;
  /** How fitment was established (e.g. "eBay compatibility table",
   * "distributor catalog"). */
  source: string;
};

/**
 * SERVER-ONLY offer. The full record including seller identity and the
 * source URL. This is what connectors produce and what the optimizer
 * ranks. It is projected to a `PublicOffer` before crossing the wire.
 */
export type Offer = {
  sku: string;
  sellerId: string;
  sellerType: SellerType;
  price: number;
  currency: string;
  qtyIncluded: number;
  deliveryEstimate: DeliveryEstimate;
  warranty: string;
  condition: OfferCondition;
  qualitySignals: QualitySignals;
  fitmentEvidence: FitmentEvidence;
  url: string | null;
};

export type DeliveryEstimate = {
  label: string;
  days: number;
};

// ─── Grade tier (the client-facing quality expression) ──────────────
//
// Quality is NEVER a number in the UI (directive 7). It is expressed as
// a grade tier badge + warranty term + outcome evidence.

export type GradeTier =
  | "oem_genuine"
  | "premium_aftermarket"
  | "value_aftermarket";

export const GRADE_TIER_LABEL: Record<GradeTier, string> = {
  oem_genuine: "OEM Genuine",
  premium_aftermarket: "Premium Aftermarket",
  value_aftermarket: "Value Aftermarket",
};

// ─── PublicOffer (client-facing) ────────────────────────────────────

/**
 * CLIENT-FACING offer. Contains everything a card needs and nothing
 * that identifies the seller or channel. `id` is an opaque token (a
 * hash of the internal id) — safe for React keys and quote references,
 * reveals nothing about the source.
 */
export type PublicOffer = {
  id: string;
  /** "A"/"B" are the machine picks; "candidate" is a ranked survivor
   * shown in the copilot comparison grid. */
  role: "A" | "B" | "candidate";
  partName: string;
  partNumber: string;
  brand: string | null;
  condition: "new" | "refurbished" | "used" | "unknown";
  gradeTier: GradeTier;
  warranty: string;
  price: number;
  shippingCost: number;
  currency: string;
  deliveryEstimate: DeliveryEstimate;
  /** Conneverse guarantee badge labels. Uniform across options —
   * Conneverse stands behind every pick equally. */
  guarantees: string[];
  fitmentVerified: boolean;
  /** How fitment was established ("Marketplace compatibility table for
   * this vehicle", "Distributor catalog fitment", …). Never names the
   * seller. */
  fitmentEvidence: string;
  returnsAccepted: boolean;
  /** Human-readable return terms ("30-day returns" / "Seller returns
   * policy"). */
  returnTerms: string;
  /**
   * Curated listing photo, or null. Listing photos can leak seller
   * identity, so they pass an internal approve/reject curation queue —
   * a photo that hasn't been APPROVED never crosses the wire. The UI
   * falls back to manufacturer stock imagery.
   */
  photoUrl: string | null;
  /** New supplier without enough first-party history yet. Surfaced as a
   * subtle qualitative note, never a number. */
  provisional: boolean;
  /**
   * The incumbent-channel alternative captured in this same search —
   * the market_snapshot savings baseline. Same-tier when available
   * (like-for-like); a different tier is recorded as tierChoiceDelta at
   * order time, never as savings. Null when no incumbent offered this
   * part.
   */
  marketBaseline: MarketBaseline | null;
};

/** Client-facing search result: the two picks + anonymized funnel
 * metadata (counts only — no channel names). */
export type PublicSearchResult = {
  optionA: PublicOffer | null;
  optionB: PublicOffer | null;
  /**
   * The copilot comparison grid: every qualified survivor, ranked,
   * capped at 7 — picks pinned first, the rest by score. The A/B picks
   * appear here too (same opaque ids) tagged by `role`.
   */
  candidates: PublicOffer[];
  meta: {
    considered: number;
    metQualityBar: number;
    belowBar: number;
    sourcesSearched: number;
    durationMs: number;
  };
  /**
   * Dev-only diagnostics — rejection counts (no seller identity). Present
   * only when the server runs outside production; the client renders it
   * as a debug panel. Omitted entirely in production.
   */
  debug?: {
    guardrailRejections: Record<string, number>;
    gateRejections: Record<string, number>;
    matchStrategy: "oe_hard" | "keyword";
    oeNumbers: string[];
  };
};

// ─── Purchase order & quote ─────────────────────────────────────────

export type QuoteRecord = {
  id: string;
  createdAt: string;
  vehicle: Vehicle;
  lines: Array<{
    partName: string;
    partNumber: string;
    brand: string;
    qty: number;
    unitPrice: number;
    warranty: string;
    option: "A" | "B";
  }>;
  laborHours: number;
  subtotal: number;
};

// ─── Orders & savings ledger ────────────────────────────────────────

export type OrderStatus =
  | "ordered"
  | "shipped"
  | "delivered"
  | "installed"
  | "exception";

// ─── Delivery tracker (carrier milestones) ──────────────────────────

/** The 5-stage milestone scale. A given source may support fewer —
 * the tracker renders ONLY the stages its source can actually report;
 * stages are never interpolated or faked. */
export type TrackerStage =
  | "ordered"
  | "confirmed"
  | "in_transit"
  | "out_for_delivery"
  | "delivered";

/** One verified carrier/supplier event. The ONLY thing tracker stages
 * derive from. */
export type CarrierEvent = {
  stage: TrackerStage;
  at: string;
  /** Last-scan location for credibility ("Oakland, CA"). */
  location?: string;
  note?: string;
};

export type OrderUrgency = "on_lift" | "scheduled";

/**
 * Savings-baseline source hierarchy, strictly enforced:
 *   1. shop_history    — the shop's own avg paid price for the same OE
 *                        number (CSV import), staleness-decayed: entries
 *                        older than 6 months don't qualify.
 *   2. market_snapshot — the incumbent-channel price for the same part,
 *                        same condition, same grade tier, captured in
 *                        the SAME search that produced the order.
 *   3. none            — no like-for-like baseline. Display "—" and
 *                        EXCLUDE from every savings total.
 */
export type BaselineSource = "shop_history" | "market_snapshot" | "none";

export type SavingsBaseline = {
  baselinePrice: number | null;
  baselineSource: BaselineSource;
  baselineTimestamp: string | null;
  /**
   * When the chosen part's grade tier differs from the alternative's,
   * the delta is recorded HERE — a tier choice, never savings.
   */
  tierChoiceDelta: number | null;
};

export type OrderLine = {
  id: string;
  partName: string;
  /** OE / part number — the join key for shop-history baselines. */
  partNumber: string;
  brand: string;
  gradeTier: GradeTier;
  condition: string;
  qty: number;
  /** Per-unit price actually paid. */
  unitPricePaid: number;
  baseline: SavingsBaseline;
  /** Demo-catalog part id — lets a delayed order search for a faster
   * swap via /api/search. */
  catalogPartId?: string;
};

export type PurchaseOrder = {
  id: string;
  createdAt: string;
  quoteId: string | null;
  shopId: string;
  vehicle: Vehicle;
  /** Seller the PO is routed to — SERVER-ONLY, never returned to a
   * client-facing surface. Attribution is "Fulfilled by Conneverse". */
  sellerId: string;
  status: OrderStatus;
  /** Full transition log. Manual (concierge ops) today; the same
   * append seam is what carrier/supplier webhooks will call. */
  statusHistory: Array<{ status: OrderStatus; at: string; note?: string }>;
  /** Promised arrival (ISO date). Drives the delay alert. */
  etaDate: string;
  /** Verified carrier events — the tracker's ONLY data source. */
  carrierEvents: CarrierEvent[];
  /** Milestone stages this order's source can report. The tracker
   * renders exactly these — a 3-stage source renders 3 columns. */
  supportedStages: TrackerStage[];
  /** on_lift orders sort first and get the loudest delay treatment. */
  urgency: OrderUrgency;
  lines: OrderLine[];
};

/** Client-safe projection of a PurchaseOrder — drops sellerId. */
export type PublicOrder = Omit<PurchaseOrder, "sellerId">;

/** Like-for-like market alternative captured at search time —
 * server-computed from the incumbent channel; carries no seller
 * identity. Feeds the market_snapshot baseline. */
export type MarketBaseline = {
  price: number;
  gradeTier: GradeTier;
  condition: string;
  capturedAt: string;
};

// ─── Claims (warranty / returns) ────────────────────────────────────

/**
 * Stable reason taxonomy. Each value maps to the model component its
 * outcome records train:
 *   doesnt_fit          → matcher / Part-Identity Graph corrections
 *   failed_after_install → quality scores
 *   arrived_damaged     → seller/carrier scores
 *   no_longer_needed    → excluded from training
 */
export type ClaimReason =
  | "doesnt_fit"
  | "failed_after_install"
  | "arrived_damaged"
  | "no_longer_needed";

export type ClaimTrainsComponent =
  | "matcher"
  | "quality"
  | "seller_carrier"
  | "excluded";

export const CLAIM_TRAINING_MAP: Record<ClaimReason, ClaimTrainsComponent> = {
  doesnt_fit: "matcher",
  failed_after_install: "quality",
  arrived_damaged: "seller_carrier",
  no_longer_needed: "excluded",
};

export type ClaimResolution = "replacement" | "refund";

export type ClaimStatus =
  | "under_review"
  | "approved"
  | "replacement_shipped"
  | "picked_up"
  | "credited";

/**
 * The claim outcome record — optimizer-v4 training data. Rates must be
 * computed against ALL delivered lines (orders without claims are the
 * denominator), never from claims alone.
 */
export type ClaimRecord = {
  id: string;
  createdAt: string;
  orderId: string;
  lineId: string;
  // Outcome-record payload
  sku: string;
  oeNumber: string;
  /** SERVER-ONLY — never crosses to a client-facing surface. */
  sellerId: string;
  brand: string;
  vehicle: Vehicle;
  shopId: string;
  reason: ClaimReason;
  trainsComponent: ClaimTrainsComponent;
  photoRef: string | null;
  resolution: ClaimResolution;
  orderedAt: string;
  deliveredAt: string;
  claimedAt: string;
  timeToFailureDays: number;
  mileageAtInstall: number | null;
  // Lifecycle
  status: ClaimStatus;
  statusHistory: Array<{ status: ClaimStatus; at: string }>;
  autoApproved: boolean;
  creditMemoId: string | null;
  /** SERVER-ONLY — RMA is created but never displayed. */
  rmaId: string | null;
};

/** Client-safe claim — seller identity and RMA stripped. */
export type PublicClaim = Omit<ClaimRecord, "sellerId" | "rmaId">;
