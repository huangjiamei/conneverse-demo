"use client";

/**
 * Part search — free text is the primary input. Mechanics type
 * shorthand ("RT fender liner", "lf hub asy") and press Enter; the
 * resolution layer normalizes it and the UI confirms before
 * proceeding: "We think you mean: Fender liner — right front ✓ /
 * change". Never proceeds without confirmation — the graceful-miss
 * design. Garbage input and off-catalog parts degrade to guided
 * category selection (the grid below).
 *
 * Catalog autocomplete still works for exact names.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";
import type { ResolveResult } from "@/lib/resolve";

type ResolveState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "confirm"; result: ResolveResult; freeText: string }
  | { status: "nomatch" }
  | { status: "offcatalog"; label: string };

export function PartSearch() {
  const {
    vehicleSelected,
    make,
    model,
    year,
    searchQuery,
    updateSearchQuery,
    autocompleteParts,
    availableParts,
    selectPart,
  } = useSourcing();

  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [resolveState, setResolveState] = useState<ResolveState>({
    status: "idle",
  });
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

  async function handleResolve() {
    const freeText = searchQuery.trim();
    if (!freeText) return;

    setShowAutocomplete(false);
    setResolveState({ status: "loading" });

    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle: { year, make, model },
          freeText,
        }),
      });
      const data = (await res.json()) as ResolveResult;
      if (!res.ok) throw new Error("resolve failed");

      if (data.partType) {
        setResolveState({ status: "confirm", result: data, freeText });
      } else {
        setResolveState({ status: "nomatch" });
      }
    } catch {
      setResolveState({ status: "nomatch" });
    }
  }

  async function handleConfirm(result: ResolveResult, freeText: string) {
    // Log the confirmed pair — training data for the resolver.
    fetch("/api/resolve/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        freeText,
        vehicle: { year, make, model },
        taxonomyId: result.taxonomyId,
        partType: result.partType,
        position: result.position,
        partId: result.partId,
        source: result.source,
      }),
    }).catch(() => {
      // Logging must never block the flow.
    });

    if (result.partId) {
      const part = availableParts.find((p) => p.id === result.partId);
      if (part) {
        setResolveState({ status: "idle" });
        selectPart(part.id, part.category, part.name);
        return;
      }
    }
    // Confirmed, but the demo catalog doesn't stock it — guided fallback.
    setResolveState({
      status: "offcatalog",
      label: result.partType ?? "That part",
    });
  }

  const positionLabel = (r: ResolveResult) =>
    r.position ? `${r.partType} — ${r.position}` : r.partType;

  return (
    <div className="mt-4 relative" ref={searchRef}>
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder='Type a part — shorthand works ("RT fender liner", "serp belt")'
          className="w-full rounded-lg border border-gray-200 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition"
          value={searchQuery}
          onChange={(e) => {
            updateSearchQuery(e.target.value);
            setShowAutocomplete(true);
            setResolveState({ status: "idle" });
          }}
          onFocus={() => setShowAutocomplete(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleResolve();
          }}
        />
        {resolveState.status === "loading" && (
          <Loader2
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-teal"
          />
        )}
      </div>

      {showAutocomplete && autocompleteParts.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {autocompleteParts.map((p) => (
            <button
              key={p.id}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal/5 transition flex items-center justify-between"
              onClick={() => {
                setShowAutocomplete(false);
                setResolveState({ status: "idle" });
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

      {/* ─── Resolution confirm chip ─── */}
      {resolveState.status === "confirm" && (
        <div className="mt-2 rounded-lg border border-teal/20 bg-teal/5 p-3">
          <p className="text-sm text-dark">
            We think you mean:{" "}
            <span className="font-semibold">
              {positionLabel(resolveState.result)}
            </span>
          </p>
          {resolveState.result.category && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              {resolveState.result.category}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() =>
                handleConfirm(resolveState.result, resolveState.freeText)
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal/90 transition"
            >
              <Check size={13} />
              Yes, that&rsquo;s it
            </button>
            <button
              onClick={() => setResolveState({ status: "idle" })}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition"
            >
              <X size={13} />
              Change
            </button>
          </div>
        </div>
      )}

      {resolveState.status === "nomatch" && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm text-gray-600">
            Couldn&rsquo;t identify that part.
          </p>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Try different words, or pick from the categories below.
          </p>
        </div>
      )}

      {resolveState.status === "offcatalog" && (
        <div className="mt-2 rounded-lg border border-amber/30 bg-amber/5 p-3">
          <p className="text-sm text-gray-700">
            <span className="font-medium">{resolveState.label}</span> isn&rsquo;t
            in the demo parts catalog yet.
          </p>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Your request was noted. Pick a stocked part from the categories
            below.
          </p>
        </div>
      )}
    </div>
  );
}
