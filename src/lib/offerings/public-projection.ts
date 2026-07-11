/**
 * Public projection — the anti-scraping boundary.
 *
 * Maps an internal `Offering` (server-only, carries seller identity and
 * numeric reliability) to a `PublicOffer` (client-facing, no seller /
 * channel identity, quality expressed as a grade tier). Everything the
 * client receives passes through here.
 *
 * Directives enforced here:
 *   6 — supplier anonymization: sellerId/sellerName/channel/sourceUrl
 *       are dropped. Attribution becomes "Fulfilled by Conneverse".
 *   7 — no numeric quality scores: reliability.composite becomes a
 *       grade tier badge; the number stays server-side.
 */

import { createHash } from "crypto";
import { store } from "@/lib/api/store";
import type {
  GradeTier,
  PublicOffer,
  PublicSearchResult,
} from "@/types/canonical";
import type { AggregateResult, Offering } from "./types";

// ─── Grade-tier classification ──────────────────────────────────────

// Brands treated as OEM-genuine or OE-supplier grade.
const OEM_BRANDS = new Set([
  "Toyota", "Honda", "Ford", "Chevrolet", "GM", "Motorcraft", "ACDelco",
  "Mopar", "Denso", "Aisin", "Hyundai", "Subaru", "Nissan", "BMW",
  "Mercedes-Benz",
]);

// Recognized premium aftermarket brands.
const PREMIUM_BRANDS = new Set([
  "Bosch", "Brembo", "Akebono", "MOOG", "Bilstein", "KYB", "NGK",
  "Wagner", "Raybestos", "Gates", "Continental", "Centric", "Delphi",
  "TYC", "Dayco",
]);

/**
 * Classify an offering into a grade tier from its brand, the vehicle
 * make, and condition. Heuristic and demo-grade — a real Part-Identity
 * Graph would drive this in production.
 */
export function classifyGradeTier(
  brand: string | null,
  make: string | undefined,
  condition: string
): GradeTier {
  // Used/refurbished parts never claim OEM-genuine tier.
  const isNew = condition === "new";

  if (brand) {
    if (make && brand.toLowerCase() === make.toLowerCase() && isNew) {
      return "oem_genuine";
    }
    if (OEM_BRANDS.has(brand) && isNew) {
      return "oem_genuine";
    }
    if (PREMIUM_BRANDS.has(brand)) {
      return "premium_aftermarket";
    }
  }
  return "value_aftermarket";
}

// ─── Warranty term formatting ───────────────────────────────────────

function warrantyLabel(offering: Offering): string {
  if (offering.warrantyDays != null) {
    return offering.warrantyDays >= 30
      ? `${Math.round(offering.warrantyDays / 30)} mo warranty`
      : `${offering.warrantyDays} day warranty`;
  }
  return offering.condition === "new" ? "Seller warranty" : "As-is";
}

// ─── Opaque id ──────────────────────────────────────────────────────

/** Non-reversible token derived from the internal id. Stable per offer
 * (so quote dedup works) but reveals no seller/channel identity. */
function opaqueId(internalId: string): string {
  return (
    "po_" +
    createHash("sha256").update(internalId).digest("base64url").slice(0, 16)
  );
}

// ─── Guarantees ─────────────────────────────────────────────────────

// Uniform Conneverse guarantee set. Because every pick is "Fulfilled by
// Conneverse", the guarantees are the same across options — this both
// tells the correct story (Conneverse stands behind both) and avoids
// leaking that one option came from a marketplace.
const CONNEVERSE_GUARANTEES = [
  "Fitment Verified",
  "Price Locked",
  "Delivery SLA",
  "30-Day Returns",
];

// ─── Fitment evidence / return terms (anonymized labels) ────────────

function fitmentEvidenceLabel(offering: Offering): string {
  if (!offering.fitmentVerified) return "Fitment not verified";
  switch (offering.channel) {
    case "ebay":
      return "Marketplace compatibility table for this vehicle";
    case "local":
      return "Confirmed by Conneverse ops on the phone";
    default:
      return "Distributor catalog fitment";
  }
}

function returnTermsLabel(offering: Offering): string {
  if (!offering.returnsAccepted) return "No returns";
  return offering.channel === "simulated"
    ? "30-day returns, Conneverse-backed"
    : "Returns accepted — Conneverse-backed";
}

/**
 * Media rule: a marketplace listing photo may render ONLY after an
 * internal reviewer approved it (photos can leak seller identity —
 * watermarks, packaging, storefront branding). Unseen photos are
 * enqueued as pending and withheld; rejected photos are withheld
 * forever. Catalog channels return null (UI uses stock imagery).
 */
function curatedPhotoUrl(offering: Offering): string | null {
  if (!offering.imageUrl) return null;
  const entry = store.ensurePhoto(
    offering.imageUrl,
    offering.partName,
    new Date().toISOString()
  );
  return entry.status === "approved" ? entry.url : null;
}

// ─── Projection ─────────────────────────────────────────────────────

export function toPublicOffer(
  offering: Offering,
  role: "A" | "B" | "candidate",
  make: string | undefined
): PublicOffer {
  return {
    id: opaqueId(offering.id),
    role,
    partName: offering.partName,
    partNumber: offering.partNumber,
    brand: offering.brand,
    condition: offering.condition,
    gradeTier: classifyGradeTier(offering.brand, make, offering.condition),
    warranty: warrantyLabel(offering),
    price: offering.landedPrice,
    shippingCost: offering.shippingCost,
    currency: offering.currency,
    deliveryEstimate: {
      label: offering.deliveryLabel,
      days: offering.deliveryDays,
    },
    guarantees: CONNEVERSE_GUARANTEES,
    fitmentVerified: offering.fitmentVerified,
    fitmentEvidence: fitmentEvidenceLabel(offering),
    returnsAccepted: offering.returnsAccepted,
    returnTerms: returnTermsLabel(offering),
    photoUrl: curatedPhotoUrl(offering),
    provisional: offering.reliability.provisional,
  };
}

/** Project a full internal aggregate result to the client-facing
 * search result. Channel NAMES are dropped — only a count crosses.
 * `includeDebug` attaches rejection counts (dev-only; the route sets it
 * from NODE_ENV). Counts carry no seller identity. */
export function toPublicSearchResult(
  result: AggregateResult,
  make: string | undefined,
  includeDebug = false
): PublicSearchResult {
  const belowBar =
    result.meta.totalConsidered - result.meta.totalAfterFilters;

  // Grid cap: 7 visible — picks pinned (aggregate already ordered them
  // first), the rest by score.
  const GRID_CAP = 7;
  const roleFor = (o: Offering): "A" | "B" | "candidate" =>
    o.id === result.optionA?.id
      ? "A"
      : o.id === result.optionB?.id
      ? "B"
      : "candidate";
  const candidates = result.candidates
    .slice(0, GRID_CAP)
    .map((o) => toPublicOffer(o, roleFor(o), make));

  const projected: PublicSearchResult = {
    optionA: result.optionA
      ? toPublicOffer(result.optionA, "A", make)
      : null,
    optionB: result.optionB
      ? toPublicOffer(result.optionB, "B", make)
      : null,
    candidates,
    meta: {
      considered: result.meta.totalConsidered,
      metQualityBar: result.meta.totalAfterFilters,
      belowBar,
      sourcesSearched: result.meta.channelsSearched.length,
      durationMs: result.meta.durationMs,
    },
  };
  if (includeDebug) {
    projected.debug = {
      guardrailRejections: result.meta.guardrailRejections,
      gateRejections: result.meta.rejections,
      matchStrategy: result.meta.matchStrategy,
      oeNumbers: result.meta.oeNumbers,
    };
  }
  return projected;
}
