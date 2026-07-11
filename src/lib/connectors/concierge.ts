/**
 * Concierge connector — SupplierConnector for phoned-in local quotes.
 *
 * A Conneverse ops person calls a local distributor, gets a price + ETA,
 * and keys it into an ops-entry form (backed by POST /api/concierge).
 * This makes Option A ("Ready Now" from a real local source) genuine for
 * pilot shops before any distributor API contract exists — the socket
 * is filled by a human, not a plug.
 *
 * The distributor's identity is held SERVER-ONLY (directive 6). The
 * offering surfaces as "Fulfilled by Conneverse" like every other pick;
 * `distributorName` never crosses the public projection.
 */

import { createHash } from "crypto";
import { composeReliability } from "@/lib/offerings/reliability.ts";
import type { Offering, ReliabilityBreakdown } from "@/lib/offerings/types.ts";
import type { Vehicle } from "@/types/canonical";
import type {
  ConnectorPartRequest,
  OrderRef,
  PurchaseOrderDraft,
  SupplierConnector,
  TrackingEvent,
} from "./SupplierConnector.ts";

/** One human-keyed local quote. `distributorName` is server-only. */
export type ConciergeQuote = {
  id: string;
  createdAt: string;
  partId: string;
  /** "2022|toyota|camry" for a specific fit, or "*" for any vehicle. */
  vehicleKey: string;
  brand: string;
  /** Landed price the ops person was quoted. */
  price: number;
  /** Hours until the shop can have it (0 = same-day pickup). */
  etaHours: number;
  deliveryLabel: string;
  warrantyDays: number | null;
  /** SERVER-ONLY — the distributor the ops person called. */
  distributorName: string;
};

// In-memory ops-entry store. Resets on cold start (demo-grade); a real
// build persists this in the DataStore.
const quotes: ConciergeQuote[] = [];

export function vehicleKey(v: {
  year: number | string;
  make: string;
  model: string;
}): string {
  return `${v.year}|${v.make.toLowerCase()}|${v.model.toLowerCase()}`;
}

export function addConciergeQuote(
  input: Omit<ConciergeQuote, "id" | "createdAt">,
  now: string
): ConciergeQuote {
  const hash = createHash("sha256")
    .update(`${input.partId}:${input.distributorName}:${quotes.length}`)
    .digest("base64url")
    .slice(0, 8);
  const record: ConciergeQuote = { ...input, id: `cq_${hash}`, createdAt: now };
  quotes.push(record);
  return record;
}

export function listConciergeQuotes(): ConciergeQuote[] {
  return [...quotes];
}

// A phoned-in local quote is Conneverse-vetted (an ops person confirmed
// fit + availability), so it carries strong reliability and is NOT
// provisional.
function conciergeReliability(): ReliabilityBreakdown {
  return composeReliability({
    fulfillment: 0.92,
    quality: 0.9,
    loyalty: 0.9,
    marketplace: 0.9,
    curation: 0.05,
    provisional: false,
    sampleSize: 0,
  });
}

export class ConciergeConnector implements SupplierConnector {
  readonly id = "concierge";
  readonly channel = "local" as const;
  readonly capabilities = {
    liveInventory: false, // a human confirmed it, not a live feed
    sameDay: true,
    returns: true,
  };

  async getQuotes(
    part: ConnectorPartRequest,
    vehicle: Vehicle
  ): Promise<Offering[]> {
    const key = vehicleKey(vehicle);
    const matches = quotes.filter(
      (q) =>
        q.partId === part.partId &&
        (q.vehicleKey === "*" || q.vehicleKey === key)
    );

    return matches.map((q): Offering => ({
      id: `local:${q.id}`,
      channel: "local",
      channelLabel: "Local distributor",
      // Server-only identity; projected away before the wire.
      sellerId: `local:${q.distributorName}`,
      sellerName: q.distributorName,

      partName: part.name,
      partNumber: part.partId,
      brand: q.brand,
      condition: "new",

      itemPrice: q.price,
      shippingCost: 0,
      landedPrice: q.price,
      currency: "USD",
      qtyIncluded: 1,

      deliveryDays: q.etaHours <= 24 ? (q.etaHours <= 8 ? 0 : 1) : 2,
      deliveryLabel: q.deliveryLabel,

      reliability: conciergeReliability(),
      fitmentVerified: true, // ops confirmed fit on the call
      warrantyDays: q.warrantyDays,
      returnsAccepted: true,

      sourceUrl: null,
      imageUrl: null,
    }));
  }

  async placeOrder(_po: PurchaseOrderDraft): Promise<OrderRef> {
    void _po;
    // A concierge order is a call-back to the ops queue.
    return { connectorId: this.id, externalRef: `concierge-${Date.now()}` };
  }

  async trackOrder(_ref: OrderRef): Promise<TrackingEvent[]> {
    void _ref;
    return [];
  }
}
