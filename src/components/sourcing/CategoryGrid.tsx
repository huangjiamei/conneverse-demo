"use client";

/**
 * Category pills (inside the selector card) and the part-card grid
 * shown when a vehicle is selected but no part picked yet.
 */

import { useSourcing } from "@/context/SourcingContext";
import { formatPrice } from "@/lib/format";

export function CategoryPills() {
  const { vehicleSelected, categories, categoryCounts, activeCategory, selectCategory } =
    useSourcing();

  if (!vehicleSelected) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => selectCategory(cat)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            activeCategory === cat
              ? "bg-teal text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {cat}
          <span
            className={`ml-1.5 text-xs ${
              activeCategory === cat
                ? "text-white/80"
                : "text-gray-400"
            }`}
          >
            {categoryCounts[cat] || 0}
          </span>
        </button>
      ))}
    </div>
  );
}

export function CategoryGrid() {
  const { vehicleSelected, selectedPart, categoryParts, selectPart } =
    useSourcing();

  if (!vehicleSelected || selectedPart || categoryParts.length === 0) {
    return null;
  }

  return (
    <div className="max-w-[860px] mx-auto mt-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categoryParts.map((p) => (
          <button
            key={p.id}
            onClick={() => selectPart(p.id, p.category, p.name)}
            className="bg-white rounded-lg border border-gray-100 p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
          >
            <div className="flex items-center gap-3">
              <img
                src={p.imageUrl}
                alt={p.name}
                className="w-12 h-10 rounded object-cover"
              />
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {p.partNumber} &middot; {p.category}
                </p>
                <p className="text-xs text-teal mt-1">
                  From {formatPrice(Math.min(...p.suppliers.map((s) => s.price)))}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
