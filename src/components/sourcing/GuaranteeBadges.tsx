"use client";

/**
 * Conneverse guarantee badges. The labels come from the PublicOffer
 * (server-derived and uniform across options) — the client never
 * decides guarantees from channel, because it never learns the channel.
 */

import { Check, Clock, Lock, RotateCcw } from "lucide-react";
import type { PublicOffer } from "@/types/canonical";

const ICON: Record<string, React.ReactNode> = {
  "Fitment Verified": <Check size={12} />,
  "Price Locked": <Lock size={12} />,
  "Delivery SLA": <Clock size={12} />,
  "30-Day Returns": <RotateCcw size={12} />,
};

export function GuaranteeBadges({ offering }: { offering: PublicOffer }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {offering.guarantees.map((label, i) => (
        <span
          key={label}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-teal bg-teal/5 ${
            i === 0 ? "px-3 py-1.5 text-xs font-semibold ring-1 ring-teal/20" : ""
          }`}
        >
          {ICON[label] ?? <Check size={12} />}
          {label}
        </span>
      ))}
    </div>
  );
}
