"use client";

/** Dismissible demo disclaimer banner. */

import { useState } from "react";
import { X } from "lucide-react";

export function DemoBanner() {
  const [showBanner, setShowBanner] = useState(true);

  if (!showBanner) return null;

  return (
    <div className="relative z-50 bg-gradient-to-r from-teal to-[#1B2838] text-white text-center text-[13px] py-2 px-4">
      <span>Conneverse Demo — Pricing is simulated. This is what the real product looks like.</span>
      <button
        onClick={() => setShowBanner(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition"
      >
        <X size={14} />
      </button>
    </div>
  );
}
