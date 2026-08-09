"use client";

import { useState } from "react";
import { Loader2, Search, Pencil, X, ChevronDown, ChevronUp } from "lucide-react";
import { CandidateCard, type Candidate } from "@/components/CandidateCard";
import { SHOWN_PRESETS } from "@/lib/presets";

// ============================================================
// Types
// ============================================================

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
  initialPartDescriptionRaw: string;
  initialPartNumber: string | null;
  initialPartNumberRaw: string | null;
  partType: string | null;
  cccLineNumber: number;
  historicalPurchase: {
    actualCost: string | null;
    vendorName: string | null;
  } | null;
  initialSelectedPreset: string;
  latestSearch: SearchResult | null;
};

// ============================================================
// Preset metadata (显示用)
// ============================================================

// 每个 preset 的说明文案 (hover 提示)。这里列全 4 个是为了让历史 PartLine 上
// 存着的 Balanced/Premium 也有文案可查; 实际展示哪几个由 SHOWN_PRESETS 决定。
const PRESET_DESCRIPTIONS: Record<string, string> = {
  Rush: "Speed first — fastest delivery ranks highest",
  Balanced: "Balance price / speed / quality",
  Budget: "Cheapest landed cost wins (default)",
  Premium: "Quality first — condition, seller, warranty",
};

// V2 preset (key 与 matcher / DB 对齐)。只展示 SHOWN_PRESETS, Budget 在前。
const PRESETS = SHOWN_PRESETS.map((key) => ({
  key,
  label: key,
  description: PRESET_DESCRIPTIONS[key] ?? "",
}));

// ============================================================
// Main component
// ============================================================

export default function SearchClient({
  partLineId,
  initialPartDescription,
  initialPartDescriptionRaw,
  initialPartNumber,
  initialPartNumberRaw,
  partType,
  cccLineNumber,
  historicalPurchase,
  initialSelectedPreset,
  latestSearch,
}: Props) {
  const [description, setDescription] = useState(initialPartDescription);
  const [partNumber, setPartNumber] = useState(initialPartNumber ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(latestSearch);
  const [error, setError] = useState<string | null>(null);
  const [showFiltered, setShowFiltered] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(initialSelectedPreset);
  const [switchingPreset, setSwitchingPreset] = useState<string | null>(null);

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
      if (data.preset) setSelectedPreset(data.preset);
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handlePresetSwitch(newPreset: string) {
    if (newPreset === selectedPreset) return;
    setError(null);

    // 无论有没有搜索过, 先把偏好写库
    // 有搜索: 通过 switch-preset (它内部会更新 partLine)
    // 无搜索: 直接 PATCH partLine (轻量)
    if (!result) {
      setSelectedPreset(newPreset);   // optimistic
      try {
        const patch = await fetch(`/api/part-lines/${partLineId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedPreset: newPreset }),
        });
        if (!patch.ok) throw new Error("Failed to save preset");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save preset");
        setSelectedPreset(selectedPreset);   // rollback
      }
      return;
    }

    // 有搜索结果: 调 switch-preset 拿新排序 + 更新 partLine
    setSwitchingPreset(newPreset);
    try {
      const res = await fetch(`/api/switch-preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchSearchId: result.id, preset: newPreset }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Switch failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult({
        ...result,
        candidateCount: data.candidateCount,
        candidates: data.candidates,
        optimizerMeta: data.optimizerMeta,
      });
      setSelectedPreset(newPreset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setSwitchingPreset(null);
    }
  }

  function cancelEdit() {
    setDescription(initialPartDescription);
    setPartNumber(initialPartNumberRaw ?? "");
    setIsEditing(false);
  }

  const verified = result?.candidates.filter((c) => c.candidateLabel === 1) ?? [];
  const others = result?.candidates.filter((c) => c.candidateLabel !== 1) ?? [];

  return (
    <>
      {/* PartLine 编辑面板 */}
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
              <>
                <div className="mt-0.5 text-[#1A1A2E]">
                  {description || (
                    <span className="text-gray-400 italic text-sm">(no description)</span>
                  )}
                </div>
                {initialPartDescriptionRaw &&
                  initialPartDescriptionRaw !== description && (
                    <div className="mt-0.5 text-xs text-gray-400 italic">
                      Original: {initialPartDescriptionRaw}
                    </div>
                  )}
              </>
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
              <>
                <div className="mt-0.5 text-[#1A1A2E] font-mono text-sm">
                  {partNumber || (
                    <span className="text-gray-400 italic font-sans">(none)</span>
                  )}
                </div>
                {initialPartNumberRaw &&
                  initialPartNumberRaw !== partNumber && (
                    <div className="mt-0.5 text-xs text-gray-400 italic font-mono">
                      Original: {initialPartNumberRaw}
                    </div>
                  )}
              </>
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

          {/* Preset 胶囊标签 */}
  <div className="flex items-center gap-3 ml-auto">
    {PRESETS.map((p) => {
      const isSelected = selectedPreset === p.key;
      const isLoading = switchingPreset === p.key;
      // V2 名字本身就短, 直接用 label
      const shortLabel = p.label;
      return (
        <button
          key={p.key}
          onClick={() => handlePresetSwitch(p.key)}
          disabled={searching || switchingPreset != null}
          title={`${p.label} — ${p.description}`}
          className={`inline-flex items-center gap-1 px-4 py-2 rounded-full border text-sm font-medium transition ${
            isSelected
              ? "border-[#00B4A6] bg-teal-50 text-[#00B4A6]"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {isLoading && <Loader2 size={14} className="animate-spin" />}
          {shortLabel}
        </button>
      );
    })}
  </div>
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* 结果区 */}
      {result && !searching && (
        <div className="mt-6">
          {historicalPurchase?.actualCost && (
            <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Baseline: historically paid{" "}
              <span className="font-semibold text-[#1A1A2E]">
                ${historicalPurchase.actualCost}
              </span>
              {historicalPurchase.vendorName && (
                <> at {historicalPurchase.vendorName}</>
              )}
            </div>
          )}

          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Verified candidates ({verified.length})
              {result.optimizerMeta && result.optimizerMeta.eligibleCount > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400 normal-case tracking-normal">
                  · ranked by {result.optimizerMeta.preset}
                </span>
              )}
            </h2>
            <span className="text-xs text-gray-400">
              Searched {new Date(result.createdAt).toLocaleString("en-US")}
            </span>
          </div>

          {verified.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
              No verified matches. Try adjusting the description or part number.
            </div>
          ) : (
            <div className="grid gap-3 auto-rows-fr">
              {verified.map((c) => (
                <CandidateCard key={c.id} candidate={c} />
              ))}
            </div>
          )}

          {others.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowFiltered(!showFiltered)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-600 hover:bg-gray-100 transition"
              >
                <span>
                  {others.length} additional candidates filtered by matcher
                  <span className="text-gray-400 ml-1">(uncertain / rejected)</span>
                </span>
                {showFiltered ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showFiltered && (
                <div className="mt-2 grid gap-3 auto-rows-fr">
                  {others.map((c) => (
                    <CandidateCard key={c.id} candidate={c} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
