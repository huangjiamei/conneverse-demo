"use client";

/**
 * 独立车辆搜索交互。
 *
 * 四层级联下拉 (Year → Make → Model → SubModel), 每选一层触发下一层 API。
 * 选完四层拿到 vehicleId, 填零件描述后调 /api/search-vehicle (不落库)。
 *
 * 级联规则: 上层变化时, 清空下面所有层的已选值和已加载列表。
 */

import { useEffect, useState } from "react";
import {
  Loader2, Search, Wrench, DollarSign, Award, Calendar,
} from "lucide-react";
import { CandidateCard, type Candidate } from "@/components/CandidateCard";

// Job Status preset 胶囊 —— key 与 matcher 的 preset 对齐
const PRESET_OPTIONS = [
  { key: "sameDayJob", label: "Car on lift", Icon: Wrench },
  { key: "costFirst", label: "Cost first", Icon: DollarSign },
  { key: "qualityFirst", label: "Quality first", Icon: Award },
  { key: "scheduled", label: "Scheduled", Icon: Calendar },
] as const;

type YearOpt = { id: number };
type NamedOpt = { id: number; name: string };
type SubModelOpt = { id: number; name: string; baseVehicleId: number; vehicleId: number };

type SearchResponse = {
  matchSearchId?: string;
  label: number | null;
  labelSource: string | null;
  candidateCount: number;
  preset: string;
  optimizerMeta?: { preset: string | null; eligibleCount: number; rejectedCount: number };
  candidates: Candidate[];
};

export default function VehicleSearchClient() {
  // 各层选项列表
  const [years, setYears] = useState<YearOpt[]>([]);
  const [makes, setMakes] = useState<NamedOpt[]>([]);
  const [models, setModels] = useState<NamedOpt[]>([]);
  const [submodels, setSubmodels] = useState<SubModelOpt[]>([]);

  // 各层已选值 (存 id; submodel 存整个对象因为要 vehicleId)
  const [year, setYear] = useState<number | null>(null);
  const [makeId, setMakeId] = useState<number | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  const [submodel, setSubmodel] = useState<SubModelOpt | null>(null);

  // 各层 loading
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingSubmodels, setLoadingSubmodels] = useState(false);

  // Job Status preset (默认 sameDayJob)
  const [preset, setPreset] = useState<string>("sameDayJob");
  const [switchingPreset, setSwitchingPreset] = useState<string | null>(null);

  // 零件信息 + 搜索
  const [partDescription, setPartDescription] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [matchSearchId, setMatchSearchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Year 预取
  useEffect(() => {
    setLoadingYears(true);
    fetch("/api/vehicles/years")
      .then((r) => r.json())
      .then((data: YearOpt[]) => setYears(data))
      .catch(() => setError("Failed to load years"))
      .finally(() => setLoadingYears(false));
  }, []);

  function selectYear(newYear: number | null) {
    setYear(newYear);
    // 清空下游
    setMakeId(null);
    setModelId(null);
    setSubmodel(null);
    setMakes([]);
    setModels([]);
    setSubmodels([]);
    if (newYear == null) return;

    setLoadingMakes(true);
    fetch(`/api/vehicles/makes?year=${newYear}`)
      .then((r) => r.json())
      .then((data: NamedOpt[]) => setMakes(data))
      .catch(() => setError("Failed to load makes"))
      .finally(() => setLoadingMakes(false));
  }

  function selectMake(newMakeId: number | null) {
    setMakeId(newMakeId);
    setModelId(null);
    setSubmodel(null);
    setModels([]);
    setSubmodels([]);
    if (newMakeId == null || year == null) return;

    setLoadingModels(true);
    fetch(`/api/vehicles/models?year=${year}&makeId=${newMakeId}`)
      .then((r) => r.json())
      .then((data: NamedOpt[]) => setModels(data))
      .catch(() => setError("Failed to load models"))
      .finally(() => setLoadingModels(false));
  }

  function selectModel(newModelId: number | null) {
    setModelId(newModelId);
    setSubmodel(null);
    setSubmodels([]);
    if (newModelId == null || year == null || makeId == null) return;

    setLoadingSubmodels(true);
    fetch(`/api/vehicles/submodels?year=${year}&makeId=${makeId}&modelId=${newModelId}`)
      .then((r) => r.json())
      .then((data: SubModelOpt[]) => setSubmodels(data))
      .catch(() => setError("Failed to load sub-models"))
      .finally(() => setLoadingSubmodels(false));
  }

  const vehicleSelected = submodel != null;

  async function handleSearch() {
    if (!submodel || !partDescription) return;
    setError(null);
    setSearching(true);
    setResult(null);
    try {
      const res = await fetch("/api/search-vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: submodel.vehicleId,
          partDescription,
          partNumber: partNumber || null,
          preset,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Search failed: HTTP ${res.status}`);
      }
      const data: SearchResponse = await res.json();
      setResult(data);
      setMatchSearchId(data.matchSearchId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  // 切 Job Status 胶囊:
  //   - 还没搜过 → 只更新前端 preset state (下次搜索用新 preset)
  //   - 已有结果 → 调 /api/switch-preset 重排 (命中缓存就不用重跑 matcher)
  async function handlePresetSwitch(newPreset: string) {
    if (newPreset === preset) return;
    setPreset(newPreset); // optimistic

    if (!matchSearchId) return;

    setError(null);
    setSwitchingPreset(newPreset);
    try {
      const res = await fetch("/api/switch-preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchSearchId, preset: newPreset }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Switch failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult((prev) =>
        prev
          ? {
              ...prev,
              candidateCount: data.candidateCount,
              candidates: data.candidates,
              optimizerMeta: data.optimizerMeta,
              preset: newPreset,
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setSwitchingPreset(null);
    }
  }

  const verified = result?.candidates.filter((c) => c.candidateLabel === 1) ?? [];
  const others = result?.candidates.filter((c) => c.candidateLabel !== 1) ?? [];

  return (
    <>
      {/* 顶部深蓝 banner */}
      <div className="bg-[#1A1A2E] text-white rounded-xl p-6">
        <div className="text-xs text-white/50 tracking-wide">Vehicle lookup</div>
        <div className="mt-1 text-2xl font-semibold">New search</div>
        <div className="mt-1 text-xs text-white/40">
          Pick a vehicle from the ACES / VCdb catalog, then search parts — no repair
          order needed.
        </div>
      </div>

      {/* 级联下拉 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Dropdown
            label="Year"
            loading={loadingYears}
            disabled={loadingYears}
            value={year ?? ""}
            onChange={(v) => selectYear(v ? Number(v) : null)}
            placeholder="Select year"
            options={years.map((y) => ({ value: y.id, label: String(y.id) }))}
          />
          <Dropdown
            label="Make"
            loading={loadingMakes}
            disabled={year == null || loadingMakes}
            value={makeId ?? ""}
            onChange={(v) => selectMake(v ? Number(v) : null)}
            placeholder={year == null ? "Select year first" : "Select make"}
            options={makes.map((m) => ({ value: m.id, label: m.name }))}
          />
          <Dropdown
            label="Model"
            loading={loadingModels}
            disabled={makeId == null || loadingModels}
            value={modelId ?? ""}
            onChange={(v) => selectModel(v ? Number(v) : null)}
            placeholder={makeId == null ? "Select make first" : "Select model"}
            options={models.map((m) => ({ value: m.id, label: m.name }))}
          />
          <Dropdown
            label="Sub-model"
            loading={loadingSubmodels}
            disabled={modelId == null || loadingSubmodels}
            value={submodel?.id ?? ""}
            onChange={(v) =>
              setSubmodel(submodels.find((s) => s.id === Number(v)) ?? null)
            }
            placeholder={modelId == null ? "Select model first" : "Select sub-model"}
            options={submodels.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>

        {/* 选完四层才显示零件输入 */}
        {vehicleSelected && (
          <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
            {/* Job Status preset 胶囊行 */}
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
                Job status
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRESET_OPTIONS.map(({ key, label, Icon }) => {
                  const selected = preset === key;
                  const loading = switchingPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePresetSwitch(key)}
                      disabled={switchingPreset != null}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] transition disabled:opacity-60 ${
                        selected
                          ? "bg-teal-50 border-[#00B4A6] text-[#00B4A6]"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {loading ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Icon size={12} />
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
                  Part description
                </label>
                <input
                  value={partDescription}
                  onChange={(e) => setPartDescription(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                  placeholder="e.g. Front bumper cover"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
                  Part number (optional)
                </label>
                <input
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                  placeholder="OEM number if known"
                />
              </div>
            </div>

            <button
              onClick={handleSearch}
              disabled={searching || !partDescription}
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
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* 结果区 */}
      {result && !searching && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Verified candidates ({verified.length})
              {result.optimizerMeta && result.optimizerMeta.eligibleCount > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400 normal-case tracking-normal">
                  · ranked by {result.optimizerMeta.preset}
                </span>
              )}
            </h2>
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
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                Other candidates ({others.length})
                <span className="text-gray-400 ml-1 normal-case tracking-normal font-normal">
                  (uncertain / rejected)
                </span>
              </h3>
              <div className="grid gap-3 auto-rows-fr">
                {others.map((c) => (
                  <CandidateCard key={c.id} candidate={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ============================================================
// Dropdown (native select + loading spinner)
// ============================================================

function Dropdown({
  label,
  loading,
  disabled,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  value: number | string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: number; label: string }[];
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] text-gray-500 uppercase tracking-wide font-medium">
        {label}
        {loading && <Loader2 size={11} className="animate-spin text-gray-400" />}
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
