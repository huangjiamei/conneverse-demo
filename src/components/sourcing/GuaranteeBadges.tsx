"use client";

/**
 * Guarantee badges — adapt to the offering's channel: a Conneverse-
 * vetted simulated supplier shows the full guarantee bar; an eBay
 * marketplace listing shows only what's actually verified for that
 * listing.
 */

import { Check, Clock, Lock, RotateCcw } from "lucide-react";
import type { Offer } from "@/types";

export function GuaranteeBadges({ offering }: { offering: Offer }) {
  const isVetted = offering.channel === "simulated";
  const badges = isVetted
    ? [
        { icon: <Check size={12} />, label: "Fitment Verified", primary: true },
        { icon: <Lock size={12} />, label: "Price Locked" },
        { icon: <Clock size={12} />, label: "Delivery SLA" },
        { icon: <RotateCcw size={12} />, label: "30-Day Returns" },
      ]
    : [
        { icon: <Check size={12} />, label: "Fitment Verified", primary: true },
        { icon: <RotateCcw size={12} />, label: "Seller returns policy" },
      ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-teal bg-teal/5 ${
            b.primary ? "px-3 py-1.5 text-xs font-semibold ring-1 ring-teal/20" : ""
          }`}
        >
          {b.icon}
          {b.label}
        </span>
      ))}
    </div>
  );
}
