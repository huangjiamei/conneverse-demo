"use client";

/** The "2022 Toyota Camry ✕" confirmation chip. */

import { Car, X } from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";

export function VehicleChip() {
  const { make, model, year, vehicleSelected, clearVehicle } = useSourcing();

  if (!vehicleSelected) return null;

  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="inline-flex items-center gap-2 bg-teal/10 text-teal rounded-full px-3 py-1 text-sm font-medium">
        <Car size={14} />
        {year} {make} {model}
        <button
          onClick={clearVehicle}
          className="ml-1 hover:bg-teal/20 rounded-full p-0.5 transition"
        >
          <X size={14} />
        </button>
      </span>
    </div>
  );
}
