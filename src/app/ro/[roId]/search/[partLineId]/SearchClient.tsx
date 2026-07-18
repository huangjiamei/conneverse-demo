"use client";

import { useState } from "react";
import { Loader2, Search, Pencil, X, Check, ExternalLink, Award } from "lucide-react";

type Candidate = {
  id: string;
  rank: number;
  title: string;
  price: string;
  currency: string;
  itemUrl: string;
  condition: string | null;
  candidateLabel: number | null;
  labelSource: string | null;
  ebayItemId: string;
  // ---- optimizer ----
  optimizerRank: number | null;
  optimizerTotal: number | null;
  optimizerPriceScore: number | null;
  optimizerQualityScore: number | null;
  optimizerGateReason: string | null;
};

type SearchResult = {
  id: string;
  createdAt: string;
  label: number | null;
  labelSource: string | null;
  candidateCount: number;
  candidates: Candidate[];
  optimizerMeta?: {
    preset: string | null;
    eligibleCount: number;
    rejectedCount: number;
  };
};

type Props = {
  partLineId: string;
  initialPartDescription: string;
  initialPartNumber: string | null;
  partType: string | null;
  cccLineNumber: number;
  latestSearch: SearchResult | null;
};

export default function SearchClient({
  partLineId,
  initialPartDescription,
  initialPartNumber,
  partType,
  cccLineNumber,
  latestSearch,
}: Props) {
  const [description, setDescription] = useState(initialPartDescription);
  const [partNumber, setPartNumber] = useState(initialPartNumber ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(latestSearch);
  const [error, setError] = useState<string | null>(null);

  const hasUnsavedEdit =
    description !== initialPartDescription ||
    (partNumber || "") !== (initialPartNumber ?? "");

  async function handleSearch() {
    setError(null);
    setSearching(true);

    try {
      if (hasUnsavedEdit) {
        const patch = await fetch(`/api/part-lines/${partLineId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partDescription: description,
            partNumber: partNumber || null,
          }),
        });
        if (!patch.ok) throw new Error("Failed to save edits");
      }

      const res = await fetch(`/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partLineId, useLlm: false }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Search failed: HTTP ${res.status}`);
      }
      const data = await res.json();

      setResult({
        id: data.matchSearchId,
        createdAt: new Date().toISOString(),
        label: data.label ?? null,
        labelSource: data.labelSource ?? null,
        candidateCount: data.candidateCount ?? 0,
        candidates: data.candidates ?? [],
        optimizerMeta: data.optimizerMeta,
      });
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function cancelEdit() {
    setDescription(initialPartDescription);
    setPartNumber(initialPartNumber ?? "");
    setIsEditing(false);
  }

  return (
    <>
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm text-gray-500">
            Line {cccLineNumber} · {partType || "Uncategorized"}
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-gray-500 hover:text-[#00B4A6] transition inline-flex items-center gap-1"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
              Part description
            </label>
            {isEditing ? (
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                placeholder="e.g. Lower grille"
              />
            ) : (
              <div className="mt-0.5 text-[#1A1A2E]">
                {description || (
                  <span className="text-gray-400 italic text-sm">
                    (no description)
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
              Part number (optional)
            </label>
            {isEditing ? (
              <input
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                placeholder="OEM number if known"
              />
            ) : (
              <div className="mt-0.5 text-[#1A1A2E] font-mono text-sm">
                {partNumber || (
                  <span className="text-gray-400 italic font-sans">
                    (none)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={handleSearch}
            disabled={searching || !description}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00A396] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {searching ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Searching eBay…
              </>
            ) : (
              <>
                <Search size={14} />
                Search eBay
              </>
            )}
          </button>

          {isEditing && (
            <button
              onClick={cancelEdit}
              disabled={searching}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition disabled:opacity-40"
            >
              <X size={13} />
              Cancel
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {result && !searching && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Candidates ({result.candidateCount})
              {result.optimizerMeta && result.optimizerMeta.eligibleCount > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400 normal-case tracking-normal">
                  · {result.optimizerMeta.eligibleCount} ranked by{" "}
                  {result.optimizerMeta.preset}
                </span>
              )}
            </h2>
            <span className="text-xs text-gray-400">
              Searched {new Date(result.createdAt).toLocaleString()}
            </span>
          </div>

          {result.candidateCount === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
              No candidates returned. Try adjusting the description or part number.
            </div>
          ) : (
            <div className="space-y-2">
              {result.candidates.map((c) => (
                <CandidateCard key={c.id} candidate={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const isVerifiedMatch = candidate.candidateLabel === 1;
  const isTopPick = candidate.optimizerRank === 1;
  const isRanked = candidate.optimizerRank != null;
  const isGated = candidate.optimizerGateReason != null;

  return (
    <div
      className={`bg-white border rounded-lg p-4 transition ${
        isTopPick
          ? "border-teal-400 shadow-md ring-1 ring-teal-100"
          : isVerifiedMatch
          ? "border-teal-200 shadow-sm"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isRanked ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1A1A2E] text-white">
                {isTopPick && <Award size={10} />}
                Rank {candidate.optimizerRank}
              </span>
            ) : (
              <span className="font-mono text-[11px] text-gray-400">
                #{candidate.rank}
              </span>
            )}
            {isVerifiedMatch && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700">
                <Check size={10} />
                Verified match
              </span>
            )}
            {candidate.candidateLabel === 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                Uncertain
              </span>
            )}
            {isGated && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700"
                title={`Filtered out: ${candidate.optimizerGateReason}`}
              >
                Filtered
              </span>
            )}
            {candidate.condition && (
              <span className="text-[11px] text-gray-500">
                {candidate.condition}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-[#1A1A2E] leading-snug">
            {candidate.title}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <a
              href={candidate.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-[#00B4A6] transition"
            >
              View on eBay <ExternalLink size={10} />
            </a>
            {isRanked && candidate.optimizerTotal != null && (
              <span
                className="text-[10px] text-gray-400"
                title={`price: ${candidate.optimizerPriceScore?.toFixed(0)} | quality: ${candidate.optimizerQualityScore?.toFixed(0)}`}
              >
                Score {candidate.optimizerTotal.toFixed(0)}
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <div className="text-lg font-semibold text-[#1A1A2E]">
            ${candidate.price}
          </div>
          <button
            disabled
            title="Ordering coming soon"
            className="mt-1 text-[11px] text-gray-400 hover:text-gray-500 cursor-not-allowed"
          >
            Order (soon)
          </button>
        </div>
      </div>
    </div>
  );
}