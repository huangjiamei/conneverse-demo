"use client";

/** Make / Model / Year cascade dropdowns. */

import { useSourcing } from "@/context/SourcingContext";

export function VehicleSelector() {
  const { make, model, year, makes, models, years, setMake, setModel, setYear } =
    useSourcing();

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Make
        </label>
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition"
          value={make}
          onChange={(e) => setMake(e.target.value)}
        >
          <option value="">Select Make</option>
          {makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Model
        </label>
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition disabled:opacity-50"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!make}
        >
          <option value="">Select Model</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[120px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Year
        </label>
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition disabled:opacity-50"
          value={year}
          onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
          disabled={!model}
        >
          <option value="">Select Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
