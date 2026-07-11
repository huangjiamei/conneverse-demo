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
  role: "A" | "B";
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
  returnsAccepted: boolean;
  /** New supplier without enough first-party history yet. Surfaced as a
   * subtle qualitative note, never a number. */
  provisional: boolean;
};

/** Client-facing search result: the two picks + anonymized funnel
 * metadata (counts only — no channel names). */
export type PublicSearchResult = {
  optionA: PublicOffer | null;
  optionB: PublicOffer | null;
  meta: {
    considered: number;
    metQualityBar: number;
    belowBar: number;
    sourcesSearched: number;
    durationMs: number;
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

export type PurchaseOrder = {
  id: string;
  createdAt: string;
  quoteId: string;
  /** Seller the PO is routed to — SERVER-ONLY, never returned to a
   * client-facing surface. */
  sellerId: string;
  status: "created" | "ordered" | "shipped" | "delivered" | "exception";
  lines: Array<{
    sku: string;
    partName: string;
    qty: number;
    unitPrice: number;
  }>;
};

/** Client-safe projection of a PurchaseOrder — drops sellerId. */
export type PublicOrder = Omit<PurchaseOrder, "sellerId">;
