"use client";

/**
 * The results zone: funnel header (directive-7 language), the Option A /
 * Option B cards, the strict-mode empty state, and the error state.
 *
 * Anonymized per directives 6 & 7: cards attribute "Fulfilled by
 * Conneverse" (no seller/channel), express quality as a grade-tier
 * badge (no numbers), and carry a uniform Conneverse guarantee. The
 * cheaper Option B explicitly notes it carries the same guarantee.
 */

import { useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";
import { formatPrice } from "@/lib/format";
import type { PublicOffer } from "@/types/canonical";
import type { Part } from "@/types";
import { GuaranteeBadges } from "./GuaranteeBadges";
import { GradeTierBadge } from "./GradeTierBadge";

function conditionLabel(condition: PublicOffer["condition"]): string {
  return condition === "new"
    ? "New"
    : condition[0].toUpperCase() + condition.slice(1);
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
}: {
  offering: PublicOffer;
  variant: "A" | "B";
  selectedPart: Part;
  savings: number;
  savingsPct: number;
  pulsing: boolean;
  onAdd: () => void;
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
          {offering.deliveryEstimate.label}
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
          {offering.brand ?? "—"} &middot; {conditionLabel(offering.condition)}
        </p>

        {/* Grade tier + warranty — quality without numbers (directive 7) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <GradeTierBadge tier={offering.gradeTier} />
          <span className="text-[11px] text-gray-500">{offering.warranty}</span>
        </div>

        {/* Attribution — always Conneverse (directive 6) */}
        <div className="mt-3 flex items-center gap-1.5 text-[12px] text-gray-500">
          <ShieldCheck size={13} className="text-teal shrink-0" />
          <span>Fulfilled by Conneverse</span>
          {offering.provisional && (
            <span className="text-[11px] text-gray-400">· newly onboarded</span>
          )}
        </div>

        <hr className="my-3 border-gray-100" />

        <p className="text-[28px] font-bold text-[#1B2838]">
          {formatPrice(offering.price)}
        </p>
        {offering.shippingCost > 0 && (
          <p className="text-[11px] text-gray-400">
            Includes {formatPrice(offering.shippingCost)} shipping
          </p>
        )}

        <div className="mt-3">
          <GuaranteeBadges offering={offering} />
        </div>

        {!isA && (
          <p className="mt-2 text-[11px] text-gray-400">
            Same Conneverse guarantee as Option A.
          </p>
        )}

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

  const handleAdd = (offering: PublicOffer, variant: "A" | "B") => {
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
      {/* Funnel header — directive 7 language */}
      <div className="bg-teal/5 rounded-lg border border-teal/15 px-4 py-3 mb-5">
        <div className="flex items-start gap-2.5 text-sm">
          <Sparkles size={16} className="text-teal mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-dark font-medium">
              {aggregate.meta.metQualityBar} match
              {aggregate.meta.metQualityBar === 1 ? "" : "es"} met the
              Conneverse quality bar
              {aggregate.meta.belowBar > 0 && (
                <>
                  {" "}· {aggregate.meta.belowBar} didn&rsquo;t and aren&rsquo;t
                  shown
                </>
              )}
              .
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Compared {aggregate.meta.considered} offerings across{" "}
              {aggregate.meta.sourcesSearched} source
              {aggregate.meta.sourcesSearched === 1 ? "" : "s"} in{" "}
              {(aggregate.meta.durationMs / 1000).toFixed(1)}s
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
            />
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-base font-medium text-gray-700 mb-2">
            No quality-verified options for this part right now.
          </p>
          <p className="text-sm text-gray-400 mb-3 max-w-md mx-auto">
            We searched {aggregate.meta.considered} listings across{" "}
            {aggregate.meta.sourcesSearched} source
            {aggregate.meta.sourcesSearched === 1 ? "" : "s"}.{" "}
            {aggregate.meta.metQualityBar} met the Conneverse quality bar
            &mdash; but none cleared our standards for {year} {make} {model}.
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
