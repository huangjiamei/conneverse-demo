/**
 * eBay connector — SupplierConnector implementation #1.
 *
 * Pipeline: Browse API search (compatibility_filter = Y/M/M for
 * server-side fitment) → guardrails (the six pre-optimizer filters) →
 * kit-normalized Offerings. Guardrail rejections are written to the
 * per-request diagnostics sink so the debug panel can surface counts.
 *
 * placeOrder / trackOrder are stubbed until Prompt 6 wires the eBay
 * order + fulfillment APIs.
 */

import { searchEbayParts } from "@/lib/ebay-search.ts";
import { applyEbayGuardrails } from "@/lib/guardrails.ts";
import { ebayToOfferings } from "@/lib/offerings/adapters.ts";
import type { Offering } from "@/lib/offerings/types.ts";
import type { Vehicle } from "@/types/canonical";
import type {
  ConnectorContext,
  ConnectorPartRequest,
  OrderRef,
  PurchaseOrderDraft,
  SupplierConnector,
  TrackingEvent,
} from "./SupplierConnector.ts";

export class EbayConnector implements SupplierConnector {
  readonly id = "ebay";
  readonly channel = "ebay" as const;
  readonly capabilities = {
    liveInventory: true,
    sameDay: false,
    returns: true,
  };

  async getQuotes(
    part: ConnectorPartRequest,
    vehicle: Vehicle,
    ctx?: ConnectorContext
  ): Promise<Offering[]> {
    const limit = ctx?.limit ?? 10;
    const buyerZip = ctx?.buyerZip;
    let items;
    let matchStrategy: "oe_hard" | "keyword" = "keyword";
    try {
      // Staged matcher: an OE hard-match (consensus OE number, precise
      // and vehicle-specific) is PREFERRED — its results lead the set —
      // but we fill with keyword hits so coverage (and Option B) never
      // collapses when the OE query is thin.
      const oe = ctx?.oeNumbers?.[0];
      const oeItems = oe
        ? await searchEbayParts(oe, { limit, vehicle, buyerZip })
        : [];

      if (oeItems.length >= 2) {
        matchStrategy = "oe_hard";
        if (oeItems.length >= limit) {
          items = oeItems;
        } else {
          const keyword = await searchEbayParts(part.name, { limit, vehicle, buyerZip });
          const seen = new Set(oeItems.map((i) => i.itemId));
          items = [
            ...oeItems,
            ...keyword.filter((i) => !seen.has(i.itemId)),
          ].slice(0, limit);
        }
      } else {
        items = await searchEbayParts(part.name, { limit, vehicle, buyerZip });
      }
    } catch (err) {
      // Degrade gracefully — one channel failing must not sink the search.
      console.error(
        "[ebay-connector] search failed:",
        err instanceof Error ? err.message : String(err)
      );
      return [];
    }
    if (ctx?.diagnostics) ctx.diagnostics.matchStrategy = matchStrategy;

    // Guardrails run BEFORE the optimizer sees anything.
    const { passed, rejected } = applyEbayGuardrails(items, {
      partName: part.name,
      category: part.category,
      vehicle,
    });
    if (ctx?.diagnostics) {
      ctx.diagnostics.guardrailRejections.push(...rejected);
    }

    return ebayToOfferings({
      items: passed,
      partName: part.name,
      // The search used compatibility_filter — by construction, survivors
      // pass eBay's fitment table check for this vehicle.
      fitmentVerified: true,
    });
  }

  async placeOrder(_po: PurchaseOrderDraft): Promise<OrderRef> {
    void _po;
    throw new Error("EbayConnector.placeOrder not implemented (Prompt 6)");
  }

  async trackOrder(_ref: OrderRef): Promise<TrackingEvent[]> {
    void _ref;
    throw new Error("EbayConnector.trackOrder not implemented (Prompt 6)");
  }
}
