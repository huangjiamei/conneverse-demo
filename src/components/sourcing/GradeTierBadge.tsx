"use client";

/**
 * Grade-tier badge — the client-facing expression of quality (directive
 * 7: no numeric scores). OEM Genuine / Premium Aftermarket / Value
 * Aftermarket, color-coded.
 */

import { Award } from "lucide-react";
import { GRADE_TIER_LABEL, type GradeTier } from "@/types/canonical";

const STYLES: Record<GradeTier, string> = {
  oem_genuine: "bg-teal/10 text-teal ring-1 ring-teal/20",
  premium_aftermarket: "bg-[#1B2838]/5 text-[#1B2838] ring-1 ring-[#1B2838]/15",
  value_aftermarket: "bg-gray-100 text-gray-600",
};

export function GradeTierBadge({ tier }: { tier: GradeTier }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STYLES[tier]}`}
    >
      <Award size={11} />
      {GRADE_TIER_LABEL[tier]}
    </span>
  );
}
