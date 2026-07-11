"use client";

/**
 * Reliability breakdown — inline expandable detail that demystifies
 * how each composite score was computed. This is the visible "moat" —
 * the customer sees that Conneverse weighs fulfillment + quality +
 * loyalty signals.
 */

import type { Offer } from "@/types";

export function ReliabilityBreakdown({ offering }: { offering: Offer }) {
  const r = offering.reliability;
  const rows: Array<{ label: string; value: number }> = [
    { label: "Fulfillment", value: r.fulfillment },
    { label: "Quality", value: r.quality },
    { label: "Loyalty", value: r.loyalty },
    { label: "Marketplace", value: r.marketplace },
  ];
  return (
    <div className="mt-2 pt-2 border-t border-gray-200/80 space-y-1.5 text-[11px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="text-gray-500 w-[72px] shrink-0">{row.label}</span>
          <div className="flex-1 bg-gray-200 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-teal rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, row.value * 100))}%` }}
            />
          </div>
          <span className="text-gray-600 tabular-nums w-8 text-right">
            {Math.round(row.value * 100)}
          </span>
        </div>
      ))}
      {r.curation !== 0 && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-gray-500 w-[72px] shrink-0">Curation</span>
          <span
            className={`flex-1 text-[11px] ${
              r.curation > 0 ? "text-teal" : "text-amber"
            }`}
          >
            {r.curation > 0 ? "+" : ""}
            {Math.round(r.curation * 100)} pts
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-200/80">
        <span className="text-dark font-medium w-[72px] shrink-0">
          Composite
        </span>
        <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-[#1B2838] rounded-full"
            style={{ width: `${r.composite * 100}%` }}
          />
        </div>
        <span className="text-dark font-semibold tabular-nums w-8 text-right">
          {Math.round(r.composite * 100)}
        </span>
      </div>
      {r.provisional && (
        <p className="text-[11px] text-amber pt-1 flex items-start gap-1">
          <span className="font-bold leading-none mt-0.5">!</span>
          <span>
            Provisional — earns full credit with verified Conneverse
            orders.
          </span>
        </p>
      )}
      {r.sampleSize > 0 && (
        <p className="text-[10px] text-gray-400">
          Based on {r.sampleSize.toLocaleString()} reviews
        </p>
      )}
    </div>
  );
}
