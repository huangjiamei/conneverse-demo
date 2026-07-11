/**
 * Simulated connector — the existing local-supplier archetypes
 * (Metro Parts Direct, National Auto Supply, …) wrapped in the
 * SupplierConnector interface. Everything it returns is tagged
 * `channel: "simulated"`, so the A/B comparison stays meaningful until
 * real local-distributor APIs (implementation #2) land.
 *
 * Resolves the full catalog Part from the request's partId — connectors
 * own their own data lookup.
 */

import { PARTS_CATALOG } from "@/data/parts-catalog";
import { simulatedToOfferings } from "@/lib/offerings/adapters.ts";
import type { Offering } from "@/lib/offerings/types.ts";
import type { Vehicle } from "@/types/canonical";
import type {
  ConnectorPartRequest,
  OrderRef,
  PurchaseOrderDraft,
  SupplierConnector,
  TrackingEvent,
} from "./SupplierConnector.ts";

export class SimulatedConnector implements SupplierConnector {
  readonly id = "simulated";
  readonly channel = "simulated" as const;
  readonly capabilities = {
    liveInventory: false,
    sameDay: true,
    returns: true,
  };

  async getQuotes(
    part: ConnectorPartRequest,
    _vehicle: Vehicle
  ): Promise<Offering[]> {
    void _vehicle;
    const catalogPart = PARTS_CATALOG.find((p) => p.id === part.partId);
    if (!catalogPart) return [];
    return simulatedToOfferings(catalogPart);
  }

  async placeOrder(_po: PurchaseOrderDraft): Promise<OrderRef> {
    void _po;
    // Simulated: instantly "accepted".
    return { connectorId: this.id, externalRef: `sim-${Date.now()}` };
  }

  async trackOrder(_ref: OrderRef): Promise<TrackingEvent[]> {
    void _ref;
    return [];
  }
}
