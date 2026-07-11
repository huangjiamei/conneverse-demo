"use client";

/**
 * The aggregated results zone: funnel header (the demo's visible value
 * prop), the Option A / Option B cards, the strict-mode empty state,
 * and the aggregator error state.
 */

import { useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";
import { formatPrice } from "@/lib/format";
import type { Offer, Part } from "@/types";
import { GuaranteeBadges } from "./GuaranteeBadges";
import { ReliabilityBreakdown } from "./ReliabilityBreakdown";

function channelDisplayLabel(o: Offer): string {
  // What appears as the chip on a card. eBay marketplace listings get
  // their seller feedback %; simulated suppliers get their "type"
  // (Local Distributor, National Chain, etc.).
  if (o.channel === "ebay") {
    const fp = o.reliability.marketplace;
    return `${o.channelLabel} · ${(fp * 100).toFixed(1)}% pos`;
  }
  return o.channelLabel;
}

// ─── One option card ────────────────────────────────────────────────

function OfferingCard({
  offering,
  variant,
  selectedPart,
  savings,
  savingsPct,
  pulsing,
  onAdd,
  expanded,
  onToggleExpanded,
}: {
  offering: Offer;
  variant: "A" | "B";
  selectedPart: Part;
  savings: number;
  savingsPct: number;
  pulsing: boolean;
  onAdd: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const isA = variant === "A";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
      <div className={isA ? "h-[3px] bg-teal" : "h-[3px] bg-amber"} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-1">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              isA ? "text-teal" : "text-amber"
            }`}
          >
            {isA ? "Ready Now" : "Best Price"}
          </span>
          {!isA && savings > 0 && (
            <span className="text-[11px] font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">
              Save {formatPrice(savings)} ({savingsPct}%)
            </span>
          )}
        </div>
        <p className="text-base font-semibold text-dark">
          {offering.deliveryLabel}
        </p>

        <hr className="my-3 border-gray-100" />

        {/* Product image */}
        <div className="flex flex-col items-center mb-3">
          <img
            src={selectedPart.imageUrl}
            alt={selectedPart.name}
            className="w-[120px] h-[96px] rounded-lg object-cover"
          />
          <a
            href={selectedPart.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-1.5 text-[11px] hover:underline ${
              isA ? "text-teal" : "text-amber"
            }`}
          >
            &#9654; Watch product video
          </a>
        </div>

        <hr className="my-3 border-gray-100" />

        <p className="text-[15px] font-medium">
          {selectedPart.name}
        </p>
        <p className="text-[13px] text-gray-400 mt-0.5">
          {offering.brand ?? "—"} &middot;{" "}
          {offering.condition === "new"
            ? "New"
            : offering.condition[0].toUpperCase() +
              offering.condition.slice(1)}
        </p>

        {/* Source + reliability — the moat */}
        <div className="mt-3 p-2.5 bg-gray-50/70 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[12px] text-gray-600 min-w-0">
              <span className="shrink-0">Sourced from</span>
              <span className="font-medium text-dark truncate">
                {offering.sellerName}
              </span>
            </div>
            <button
              onClick={onToggleExpanded}
              className="inline-flex items-center gap-0.5 text-[12px] font-medium text-gray-600 hover:text-dark shrink-0"
            >
              <span>
                {Math.round(offering.reliability.composite * 100)}
                %
              </span>
              <ChevronDown
                size={11}
                className={`transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {channelDisplayLabel(offering)}
          </p>
          {expanded && <ReliabilityBreakdown offering={offering} />}
        </div>

        <hr className="my-3 border-gray-100" />

        <p className="text-[28px] font-bold text-[#1B2838]">
          {formatPrice(offering.landedPrice)}
        </p>
        {offering.shippingCost > 0 && (
          <p className="text-[11px] text-gray-400">
            Includes {formatPrice(offering.shippingCost)}{" "}
            shipping
          </p>
        )}

        <div className="mt-3">
          <GuaranteeBadges offering={offering} />
        </div>

        <button
          onClick={onAdd}
          className={`mt-4 w-full h-11 rounded-lg ${
            isA
              ? "bg-teal hover:bg-teal/90"
              : "bg-amber hover:bg-amber/90"
          } text-white font-medium text-sm active:scale-[0.98] transition-all duration-150 ${
            pulsing ? "animate-pulse" : ""
          }`}
        >
          Add to Quote &rarr;
        </button>

        {offering.sourceUrl && (
          <a
            href={offering.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
          >
            View original listing{" "}
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── The results zone ───────────────────────────────────────────────

export function ResultCards() {
  const {
    isSearching,
    aggregating,
    aggregate,
    aggregateError,
    selectedPart,
    resultsVisible,
    optionA,
    optionB,
    hasResults,
    savings,
    savingsPct,
    addToQuote,
    make,
    model,
    year,
  } = useSourcing();

  const [pulsingButton, setPulsingButton] = useState<string | null>(null);
  const [expandedReliability, setExpandedReliability] = useState<
    Record<string, boolean>
  >({});

  const busy = isSearching || aggregating;

  if (busy || !selectedPart) return null;

  if (aggregateError) {
    return (
      <div className="max-w-[860px] mx-auto mt-6">
        <div className="bg-white rounded-xl border border-red-200 p-6 text-center">
          <p className="text-sm font-medium text-red-700 mb-1">
            Couldn&rsquo;t load offerings.
          </p>
          <p className="text-xs text-gray-500">{aggregateError}</p>
        </div>
      </div>
    );
  }

  if (!aggregate) return null;

  const toggleExpanded = (id: string) =>
    setExpandedReliability((s) => ({ ...s, [id]: !s[id] }));

  const handleAdd = (offering: Offer, variant: "A" | "B") => {
    addToQuote(offering, selectedPart, variant);
    setPulsingButton(variant);
    setTimeout(() => setPulsingButton(null), 600);
  };

  return (
    <div
      className={`max-w-[860px] mx-auto mt-6 transition-opacity duration-300 ${
        resultsVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Funnel header — the demo's visible value prop */}
      <div className="bg-teal/5 rounded-lg border border-teal/15 px-4 py-3 mb-5">
        <div className="flex items-start gap-2.5 text-sm">
          <Sparkles
            size={16}
            className="text-teal mt-0.5 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-dark font-medium">
              Compared {aggregate.meta.totalConsidered} offerings
              across {aggregate.meta.channelsSearched.length} channel
              {aggregate.meta.channelsSearched.length === 1
                ? ""
                : "s"}{" "}
              in {(aggregate.meta.durationMs / 1000).toFixed(1)}s.
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {aggregate.meta.totalAfterFilters} passed quality +
              reliability gates
              {aggregate.meta.totalConsidered -
                aggregate.meta.totalAfterFilters >
                0 && (
                <>
                  {" · "}
                  {aggregate.meta.totalConsidered -
                    aggregate.meta.totalAfterFilters}{" "}
                  filtered out
                </>
              )}
              {hasResults ? " · Top 2 picks below." : "."}
            </p>
          </div>
        </div>
      </div>

      {hasResults ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {optionA && (
            <OfferingCard
              offering={optionA}
              variant="A"
              selectedPart={selectedPart}
              savings={savings}
              savingsPct={savingsPct}
              pulsing={pulsingButton === "A"}
              onAdd={() => handleAdd(optionA, "A")}
              expanded={!!expandedReliability[optionA.id]}
              onToggleExpanded={() => toggleExpanded(optionA.id)}
            />
          )}
          {optionB && (
            <OfferingCard
              offering={optionB}
              variant="B"
              selectedPart={selectedPart}
              savings={savings}
              savingsPct={savingsPct}
              pulsing={pulsingButton === "B"}
              onAdd={() => handleAdd(optionB, "B")}
              expanded={!!expandedReliability[optionB.id]}
              onToggleExpanded={() => toggleExpanded(optionB.id)}
            />
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-base font-medium text-gray-700 mb-2">
            No quality-verified options for this part right now.
          </p>
          <p className="text-sm text-gray-400 mb-3 max-w-md mx-auto">
            We searched {aggregate.meta.totalConsidered} listings
            across {aggregate.meta.channelsSearched.length} channel
            {aggregate.meta.channelsSearched.length === 1 ? "" : "s"}.{" "}
            {aggregate.meta.totalAfterFilters} passed quality +
            reliability gates &mdash; but none met our standards for{" "}
            {year} {make} {model}.
          </p>
          <p className="text-xs text-gray-400">
            Try another part, or check back later as suppliers refresh
            inventory.
          </p>
        </div>
      )}
    </div>
  );
}
