/**
 * Shared domain types — the vocabulary every layer speaks.
 *
 * These are the contract between the UI shells (standalone app,
 * embeddable panel, headless API) and the core. Future adapters
 * (SMS hosts, canonical schema in Prompt 1) translate into these.
 */

// Offer is the channel-agnostic unit the optimizer ranks. Today it's
// the Offering shape from the aggregator; the alias exists so callers
// depend on the domain name, not the module layout.
export type { Offering as Offer, Offering } from "@/lib/offerings/types";
export type { Supplier } from "@/data/suppliers";
export type { Part } from "@/data/parts-catalog";

export type {
  DemandContext,
  GateLogEntry,
  Recommendation,
} from "@/lib/optimizer";

export type Vehicle = {
  year: number;
  make: string;
  model: string;
};

/** A single part the user (or a host system) wants sourced. */
export type PartRequest = {
  partId: string;
  category: string;
  name: string;
};

/** One line in the quote being built. */
export type QuoteLine = {
  id: string;
  partName: string;
  partNumber: string;
  brand: string;
  supplierId: string;
  supplierName: string;
  price: number;
  warranty: string;
  deliveryLabel: string;
  qty: number;
  option: "A" | "B";
  category: string;
  // ─── Order-placement context (from the PublicOffer) ───
  /** Opaque public offer id — the server maps it back to a seller
   * group when the order is placed. */
  offerId?: string;
  /** Demo-catalog part id (enables delayed-order swap search). */
  catalogPartId?: string;
  gradeTier?: import("./canonical").GradeTier;
  condition?: string;
  deliveryDays?: number;
  /** Like-for-like market alternative captured at search time. */
  marketBaseline?: import("./canonical").MarketBaseline | null;
};
