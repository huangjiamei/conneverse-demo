/**
 * Grade-tier classification — shared by the public projection (badge
 * rendering) and the optimizer v3 (policy floors, tier preferences).
 *
 * Heuristic and demo-grade — a real Part-Identity Graph drives this in
 * production.
 */

import type { GradeTier } from "@/types/canonical";

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

/** Ordering for tier-floor comparisons (higher = better grade). */
export const TIER_RANK: Record<GradeTier, number> = {
  value_aftermarket: 0,
  premium_aftermarket: 1,
  oem_genuine: 2,
};
