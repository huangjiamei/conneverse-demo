/**
 * Channel adapters: convert source-specific records (eBay items,
 * simulated suppliers, etc.) into channel-agnostic Offerings.
 *
 * One adapter per channel keeps the aggregator simple — it just
 * concatenates the output of each adapter.
 */

import type { Part, SupplierEntry } from "@/data/parts-catalog";
import { SUPPLIERS } from "@/data/suppliers";
import type { EbayItem } from "@/lib/ebay-search.ts";
import type { Condition, Offering } from "./types.ts";
import {
  reliabilityFromEbay,
  reliabilityFromSimulated,
} from "./reliability.ts";

// ─── Simulated suppliers ─────────────────────────────────────────────

/**
 * Walk a Part's supplier entries and produce one Offering per supplier
 * that has the part in stock. Channel: "simulated" until we wire real
 * distributors.
 */
export function simulatedToOfferings(part: Part): Offering[] {
  const offerings: Offering[] = [];

  for (const se of part.suppliers) {
    if (!se.inStock) continue;

    const supplier = SUPPLIERS.find((s) => s.id === se.supplierId);
    if (!supplier) continue;

    const catScore = supplier.categoryScores[part.category];
    if (!catScore) continue;

    const reliability = reliabilityFromSimulated({
      supplierId: supplier.id,
      categoryScore: catScore.score,
      reviewCount: catScore.reviewCount,
    });

    const warrantyDays = parseWarrantyDays(se.warranty);

    offerings.push({
      id: `sim:${part.id}:${supplier.id}`,
      channel: "simulated",
      channelLabel: supplier.type, // "Local Distributor", "National Chain", ...
      sellerId: `sim:${supplier.id}`,
      sellerName: supplier.name,

      partName: part.name,
      partNumber: part.partNumber,
      brand: se.brand,
      condition: "new",

      itemPrice: se.price,
      shippingCost: 0, // simulated suppliers bundle shipping in price
      landedPrice: se.price,
      currency: "USD",

      deliveryDays: se.deliveryDays,
      deliveryLabel: se.deliveryLabel,

      reliability,
      // Simulated distributors are by definition fitment-verified for
      // parts in their catalog — that's the curation promise.
      fitmentVerified: true,
      warrantyDays,
      returnsAccepted: true,

      sourceUrl: null,
    });
  }

  return offerings;
}

/** Parses warranty strings like "24 mo", "2 years", "30 days" → days. */
function parseWarrantyDays(warranty: string | undefined): number | null {
  if (!warranty) return null;
  const m = warranty.match(/(\d+)\s*(day|days|mo|month|months|yr|year|years)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith("day")) return n;
  if (unit.startsWith("mo")) return n * 30;
  if (unit.startsWith("yr") || unit.startsWith("year")) return n * 365;
  return null;
}

// ─── eBay marketplace ────────────────────────────────────────────────

/**
 * Convert eBay search results to Offerings. The eBay API has already
 * been called by the aggregator; this is pure transformation.
 */
export function ebayToOfferings(args: {
  items: EbayItem[];
  /** The part being searched for, used for partName fallback. */
  partName: string;
  /** Did the search use eBay's compatibility_filter? */
  fitmentVerified: boolean;
}): Offering[] {
  const { items, partName, fitmentVerified } = args;
  const now = Date.now();

  return items.map((item): Offering => {
    const shipping = item.shippingCost ?? 0;
    const landedPrice = item.price + shipping;

    const reliability = reliabilityFromEbay({
      sellerUsername: item.seller.username,
      feedbackPercentage: item.seller.feedbackPercentage,
      feedbackScore: item.seller.feedbackScore,
    });

    const deliveryDays = ebayDeliveryDays(item.minDeliveryDate, now);
    const deliveryLabel = formatEbayDeliveryLabel(
      item.minDeliveryDate,
      item.maxDeliveryDate,
      deliveryDays
    );

    return {
      id: `ebay:${item.itemId}`,
      channel: "ebay",
      channelLabel: "eBay marketplace",
      sellerId: `ebay:${item.seller.username}`,
      sellerName: item.seller.username || "unknown seller",

      partName: item.title || partName,
      partNumber: item.itemId,
      brand: extractBrand(item.title),
      condition: mapEbayCondition(item.condition),

      itemPrice: item.price,
      shippingCost: shipping,
      landedPrice,
      currency: item.currency || "USD",

      deliveryDays,
      deliveryLabel,

      reliability,
      fitmentVerified,
      // eBay doesn't surface warranty in the Browse API; condition-based
      // proxy: new ~30 days, refurbished ~30 days, used null.
      warrantyDays:
        item.condition?.toLowerCase().includes("new") ||
        item.condition?.toLowerCase().includes("refurb")
          ? 30
          : null,
      // Most eBay listings accept returns but the policy varies; we
      // conservatively say true and verify per-listing only if/when
      // we surface a Returns guarantee in the UI.
      returnsAccepted: true,

      sourceUrl: item.itemUrl,
    };
  });
}

function ebayDeliveryDays(
  minDate: string | null,
  now: number
): number {
  if (!minDate) return 7; // fallback when eBay didn't return a date
  const ms = new Date(minDate).getTime();
  if (Number.isNaN(ms)) return 7;
  const days = Math.ceil((ms - now) / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}

function formatEbayDeliveryLabel(
  minIso: string | null,
  maxIso: string | null,
  fallbackDays: number
): string {
  if (!minIso || !maxIso) {
    return `Arrives in ~${fallbackDays} days`;
  }
  const min = new Date(minIso);
  const max = new Date(maxIso);
  if (Number.isNaN(min.getTime()) || Number.isNaN(max.getTime())) {
    return `Arrives in ~${fallbackDays} days`;
  }
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  const sameDay = min.toDateString() === max.toDateString();
  if (sameDay) {
    return `Arrives ${min.toLocaleDateString("en-US", { weekday: "short", ...opts })}`;
  }
  const sameMonth =
    min.getMonth() === max.getMonth() && min.getFullYear() === max.getFullYear();
  if (sameMonth) {
    return `Arrives ${min.toLocaleDateString("en-US", opts)}-${max.getDate()}`;
  }
  return `Arrives ${min.toLocaleDateString("en-US", opts)} - ${max.toLocaleDateString("en-US", opts)}`;
}

function mapEbayCondition(c: string | null): Condition {
  if (!c) return "unknown";
  const lower = c.toLowerCase();
  if (lower.includes("new")) return "new";
  if (lower.includes("refurb")) return "refurbished";
  if (lower.includes("used") || lower.includes("pre-owned")) return "used";
  return "unknown";
}

/** Crude brand extraction from listing title — finds known brands. */
function extractBrand(title: string): string | null {
  if (!title) return null;
  const known = [
    "Bosch", "ACDelco", "Brembo", "Akebono", "Wagner", "Raybestos",
    "Toyota", "Honda", "Motorcraft", "Denso", "NGK", "K&N", "Fram",
    "Mobil 1", "Castrol", "Valvoline",
  ];
  const upper = title;
  for (const b of known) {
    if (upper.includes(b)) return b;
  }
  return null;
}
