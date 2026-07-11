/**
 * SupplierConnector — the socket every sourcing channel plugs into.
 *
 * The aggregator talks only to this interface. eBay is implementation
 * #1; a future local-distributor API (AutoZone, WorldPac, …) is
 * implementation #2 with zero changes to the aggregator or optimizer —
 * the partnership is pending, so the socket exists before the plug.
 *
 * `getQuotes` returns the internal server-side `Offering` (the concrete
 * realization of the canonical `Offer` — carries seller identity and is
 * projected to a client-safe `PublicOffer` at the API boundary).
 *
 * Option A/B are ROLES the optimizer assigns, not channels: A is the
 * fastest real offer in the merged set, whatever channel it came from.
 * A connector must never invent a delivery promise — every deliveryDays
 * / deliveryLabel it returns must come from real source data.
 */

import type { Channel, Offering } from "@/lib/offerings/types.ts";
import type { GuardrailRejection } from "@/lib/guardrails.ts";
import type { Vehicle } from "@/types/canonical";

/** What the connector was asked to source. */
export type ConnectorPartRequest = {
  partId: string;
  category: string;
  name: string;
};

/** Per-request context + a diagnostics sink (no cross-request state). */
export type ConnectorContext = {
  buyerZip?: string;
  /** How many marketplace results to consider. */
  limit?: number;
  /** Consensus OE / MPN numbers (from the OE resolver). When present, a
   * marketplace connector prefers an OE hard-match over keyword search. */
  oeNumbers?: string[];
  /** Optional per-request sink the connector fills with pre-optimizer
   * guardrail rejections. The aggregator creates one per request. */
  diagnostics?: ConnectorDiagnostics;
};

export type ConnectorDiagnostics = {
  guardrailRejections: GuardrailRejection[];
  /** How the marketplace connector matched: OE hard-match or keyword. */
  matchStrategy?: "oe_hard" | "keyword";
};

export type ConnectorCapabilities = {
  liveInventory: boolean;
  sameDay: boolean;
  returns: boolean;
};

/** Forward-looking order/tracking shapes (Prompt 6 builds the board). */
export type PurchaseOrderDraft = {
  offeringId: string;
  qty: number;
};

export type OrderRef = {
  connectorId: string;
  externalRef: string;
};

export type TrackingEvent = {
  at: string;
  status: "ordered" | "shipped" | "in_transit" | "delivered" | "exception";
  detail?: string;
};

export interface SupplierConnector {
  readonly id: string;
  readonly channel: Channel;
  readonly capabilities: ConnectorCapabilities;

  /** Fetch offers for a part on a vehicle. Must degrade to `[]` (never
   * throw) on upstream failure — one channel's hiccup can't sink the
   * whole search. */
  getQuotes(
    part: ConnectorPartRequest,
    vehicle: Vehicle,
    ctx?: ConnectorContext
  ): Promise<Offering[]>;

  /** Place a purchase order. Stubbed until Prompt 6. */
  placeOrder(po: PurchaseOrderDraft): Promise<OrderRef>;

  /** Track a placed order. Stubbed until Prompt 6. */
  trackOrder(ref: OrderRef): Promise<TrackingEvent[]>;
}
