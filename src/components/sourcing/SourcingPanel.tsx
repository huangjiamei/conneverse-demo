"use client";

/**
 * SourcingPanel — the core embeddable unit. Composes the vehicle
 * selector, part search, category grid, search animation, and result
 * cards. Never assumes it owns the page: all state lives in
 * SourcingContext, and host integration flows through the
 * ContextProvider seam.
 */

import { Car } from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";
import { VehicleSelector } from "./VehicleSelector";
import { VehicleChip } from "./VehicleChip";
import { CategoryGrid, CategoryPills } from "./CategoryGrid";
import { PartSearch } from "./PartSearch";
import { SearchProgress } from "./SearchProgress";
import { ResultCards } from "./ResultCards";

export function SourcingPanel() {
  const { vehicleSelected } = useSourcing();

  return (
    <main className="flex-1 min-w-0">
      {/* ─── Vehicle + Part Selector ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 max-w-[860px] mx-auto">
        <VehicleSelector />
        <VehicleChip />
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
