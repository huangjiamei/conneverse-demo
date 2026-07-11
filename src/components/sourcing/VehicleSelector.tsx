"use client";

/**
 * Vehicle intake. Two entry modes behind a tab toggle:
 *   - Year / Make / Model dropdowns (always works; many shops quote
 *     without the VIN handy).
 *   - VIN decode via NHTSA vPIC → confirmation chip → confirm.
 *
 * VIN errors, partial decodes, and uncovered vehicles never dead-end
 * the flow: they steer the user back to the dropdowns.
 */

import { Check, Loader2, ScanLine, X } from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";
import type { VinDecode } from "@/lib/connectors/vpic";

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Human-readable label for the confirmation chip. Prefers the catalog
 * make/model (canonical casing) when covered. */
function decodeLabel(
  decode: VinDecode,
  catalogMake: string | null,
  catalogModel: string | null
): string {
  const make = catalogMake ?? (decode.make ? titleCase(decode.make) : "");
  const model = catalogModel ?? decode.model ?? "";
  const bits = [decode.year, make, model, decode.trim].filter(Boolean);
  const base = bits.join(" ");
  return decode.engine ? `${base} · ${decode.engine}` : base;
}

function ModeTabs() {
  const { entryMode, setEntryMode } = useSourcing();
  const tabs: Array<{ id: "ymm" | "vin"; label: string }> = [
    { id: "ymm", label: "Year / Make / Model" },
    { id: "vin", label: "VIN" },
  ];
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 mb-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setEntryMode(t.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
            entryMode === t.id
              ? "bg-white text-dark shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function YmmDropdowns() {
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

function VinEntry() {
  const {
    vinInput,
    setVinInput,
    vinDecoding,
    vinError,
    vinPending,
    vinCatalogMatch,
    decodeVinInput,
    confirmVin,
    rejectVin,
    setEntryMode,
  } = useSourcing();

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        VIN
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="17-character VIN"
            maxLength={17}
            value={vinInput}
            onChange={(e) => setVinInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") decodeVinInput();
            }}
            className="w-full rounded-lg border border-gray-200 pl-9 pr-4 py-2.5 text-sm uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition"
          />
        </div>
        <button
          onClick={decodeVinInput}
          disabled={vinDecoding}
          className="px-4 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal/90 active:scale-[0.98] transition disabled:opacity-60"
        >
          {vinDecoding ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            "Decode"
          )}
        </button>
      </div>

      {vinError && (
        <p className="mt-2 text-[12px] text-red-600">{vinError}</p>
      )}

      {vinPending && (
        <div className="mt-3 rounded-lg border border-teal/20 bg-teal/5 p-3">
          <p className="text-sm text-dark">
            <span className="font-semibold">
              {decodeLabel(
                vinPending,
                vinCatalogMatch?.make ?? null,
                vinCatalogMatch?.model ?? null
              )}
            </span>{" "}
            — correct?
          </p>
          {vinPending.bodyClass && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              {vinPending.bodyClass}
            </p>
          )}
          {!vinPending.checkDigitValid && (
            <p className="text-[11px] text-amber mt-1">
              Note: VIN check digit didn&rsquo;t validate — confirm the
              vehicle looks right.
            </p>
          )}

          {vinCatalogMatch ? (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={confirmVin}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal/90 transition"
              >
                <Check size={13} />
                Yes, use this vehicle
              </button>
              <button
                onClick={rejectVin}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition"
              >
                <X size={13} />
                No
              </button>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-[11px] text-gray-500">
                This vehicle isn&rsquo;t in the demo parts catalog yet.
              </p>
              <button
                onClick={() => {
                  rejectVin();
                  setEntryMode("ymm");
                }}
                className="mt-1.5 text-[12px] text-teal font-medium hover:underline"
              >
                Pick the closest with Year / Make / Model &rarr;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function VehicleSelector() {
  const { entryMode } = useSourcing();
  return (
    <div>
      <ModeTabs />
      {entryMode === "ymm" ? <YmmDropdowns /> : <VinEntry />}
    </div>
  );
}
