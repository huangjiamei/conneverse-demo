"use client";

/**
 * The animated multi-channel search loader. Shown while the scripted
 * step animation runs, and held (bar full, "Picking top 2 picks...")
 * if the aggregator API hasn't returned yet when the animation ends.
 */

import { Loader2 } from "lucide-react";
import { SEARCH_STEPS, useSourcing } from "@/context/SourcingContext";

export function SearchProgress() {
  const { isSearching, aggregating, selectedPart, searchStep, searchProgress } =
    useSourcing();

  if (!((isSearching || aggregating) && selectedPart)) return null;

  return (
    <div className="max-w-[860px] mx-auto mt-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4 overflow-hidden">
          <div
            className="h-full bg-teal rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${
                !isSearching && aggregating ? 100 : searchProgress
              }%`,
            }}
          />
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin text-teal" />
          <span>
            {isSearching
              ? SEARCH_STEPS[
                  Math.min(searchStep, SEARCH_STEPS.length - 1)
                ]
              : "Picking top 2 picks..."}
          </span>
        </div>
      </div>
    </div>
  );
}
