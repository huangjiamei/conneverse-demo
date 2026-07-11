"use client";

/** Part search input with autocomplete dropdown. */

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";

export function PartSearch() {
  const {
    vehicleSelected,
    searchQuery,
    updateSearchQuery,
    autocompleteParts,
    selectPart,
  } = useSourcing();

  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close autocomplete on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!vehicleSelected) return null;

  return (
    <div className="mt-4 relative" ref={searchRef}>
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder="Search for a specific part..."
          className="w-full rounded-lg border border-gray-200 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition"
          value={searchQuery}
          onChange={(e) => {
            updateSearchQuery(e.target.value);
            setShowAutocomplete(true);
          }}
          onFocus={() => setShowAutocomplete(true)}
        />
      </div>
      {showAutocomplete && autocompleteParts.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {autocompleteParts.map((p) => (
            <button
              key={p.id}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal/5 transition flex items-center justify-between"
              onClick={() => {
                setShowAutocomplete(false);
                selectPart(p.id, p.category, p.name);
              }}
            >
              <span>{p.name}</span>
              <span className="text-xs text-gray-400">
                {p.category}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
