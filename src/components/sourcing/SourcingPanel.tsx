"use client";

/**
 * SourcingPanel — the core embeddable unit. Composes the vehicle
 * selector, part search, category grid, search animation, and result
 * cards. Never assumes it owns the page: all state lives in
 * SourcingContext, and host integration flows through the
 * ContextProvider seam.
 */

import { Car, Wrench, CalendarClock } from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";
import { VehicleSelector } from "./VehicleSelector";
import { VehicleChip } from "./VehicleChip";
import { CategoryGrid, CategoryPills } from "./CategoryGrid";
import { PartSearch } from "./PartSearch";
import { SearchProgress } from "./SearchProgress";
import { ResultCards } from "./ResultCards";

/**
 * The ONLY per-search knob (Prompt 8: context, not knobs). One question
 * an advisor can answer without thinking: is the car on the lift right
 * now? Everything else — weights, tier bumps, policy — derives
 * server-side from context.
 */
function UrgencyToggle() {
  const { vehicleSelected, urgency, setUrgency } = useSourcing();
  if (!vehicleSelected) return null;

  const onLift = urgency === "on_lift";
  const base =
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition";

  return (
    <div className="mt-4 flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-gray-400">
        Job status
      </span>
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        <button
          onClick={() => setUrgency("on_lift")}
          className={`${base} ${
            onLift
              ? "bg-teal text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Wrench size={12} />
          Car on lift
        </button>
        <button
          onClick={() => setUrgency("scheduled_48h")}
          className={`${base} ${
            !onLift
              ? "bg-[#1B2838] text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <CalendarClock size={12} />
          Scheduled
        </button>
      </div>
    </div>
  );
}

export function SourcingPanel() {
  const { vehicleSelected } = useSourcing();

  return (
    <main className="flex-1 min-w-0">
      {/* ─── Vehicle + Part Selector ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 max-w-[860px] mx-auto">
        <VehicleSelector />
        <VehicleChip />
        <UrgencyToggle />
        <CategoryPills />
        <PartSearch />
      </div>

      {/* ─── Empty state ─── */}
      {!vehicleSelected && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Car size={48} strokeWidth={1.5} />
          <p className="mt-3 text-base">
            Select a vehicle above to start searching
          </p>
        </div>
      )}

      <CategoryGrid />
      <SearchProgress />
      <ResultCards />
    </main>
  );
}
