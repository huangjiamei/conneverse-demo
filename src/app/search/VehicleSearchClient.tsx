"use client";

/**
 * 独立车辆搜索交互。
 *
 * 四层级联下拉 (Year → Make → Model → SubModel), 每选一层触发下一层 API。
 * 选完四层拿到 vehicleId, 填零件描述后调 /api/search-vehicle (不落库)。
 *
 * 级联规则: 上层变化时, 清空下面所有层的已选值和已加载列表。
 *
 * SubModel 层可以选 "All (any submodel)": 此时不锁定具体 VcdbVehicle,
 * 改传 baseVehicleId, matcher 的 compat_filter 就不会带 Trim 段。
 */

import { useEffect, useState } from "react";
import {
  Loader2, Search, Wrench, DollarSign, Award, Calendar, Car,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { type Candidate } from "@/components/CandidateCard";
import { CandidateTable } from "./CandidateTable";
import { useSourcing } from "./SourcingContext";

// Popular vehicles —— 前端硬编码, 点一下用 /api/vehicles/resolve 反查 id 再填下拉。
// 注意: "Silverado" 在 VCdb 里不存在, 实际叫 "Silverado 1500"。
const POPULAR = [
  { year: 2022, makeName: "Toyota", modelName: "Camry" },
  { year: 2021, makeName: "Ford", modelName: "F-150" },
  { year: 2023, makeName: "Honda", modelName: "Civic" },
  { year: 2022, makeName: "Toyota", modelName: "RAV4" },
  { year: 2021, makeName: "Chevrolet", modelName: "Silverado 1500" },
] as const;

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

// SubModel 下拉里 "All" 那一项的 option value (真实 sub-model 用数字 id)
const ALL_SUBMODELS = "all";

// 选具体 sub-model → 提交 vehicleId; 选 All → 提交 baseVehicleId。
// 用一个 union 存, 避免 submodel/isAll 两个 state 相互不同步。
type SubModelSelection =
  | { kind: "all"; baseVehicleId: number }
  | { kind: "one"; opt: SubModelOpt };

// submodels 列表 → "All" 选择项。选完 Model 后默认就是它, 用户不用点第 4 层。
// 同一 year+make+model 下所有 sub-model 共享 baseVehicleId (极少数一对多时取
// 第一个也无妨: All 模式只用它反查 year/make/model 名字, 不锁定任何 sub-model)。
function allSelectionFrom(list: SubModelOpt[]): SubModelSelection | null {
  const bvId = list[0]?.baseVehicleId;
  return bvId == null ? null : { kind: "all", baseVehicleId: bvId };
}

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
  const { resetSelections, setQuoteContext } = useSourcing();

  // 各层选项列表
  const [years, setYears] = useState<YearOpt[]>([]);
  const [makes, setMakes] = useState<NamedOpt[]>([]);
  const [models, setModels] = useState<NamedOpt[]>([]);
  const [submodels, setSubmodels] = useState<SubModelOpt[]>([]);

  // 各层已选值 (存 id; submodel 存整个对象因为要 vehicleId)
  const [year, setYear] = useState<number | null>(null);
  const [makeId, setMakeId] = useState<number | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  const [subSelection, setSubSelection] = useState<SubModelSelection | null>(null);

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
  const [showOthers, setShowOthers] = useState(false);

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
    setSubSelection(null);
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
    setSubSelection(null);
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
    setSubSelection(null);
    setSubmodels([]);
    if (newModelId == null || year == null || makeId == null) return;

    setLoadingSubmodels(true);
    fetch(`/api/vehicles/submodels?year=${year}&makeId=${makeId}&modelId=${newModelId}`)
      .then((r) => r.json())
      .then((data: SubModelOpt[]) => {
        setSubmodels(data);
        setSubSelection(allSelectionFrom(data)); // 默认 All, 选完 Model 就能搜
      })
      .catch(() => setError("Failed to load sub-models"))
      .finally(() => setLoadingSubmodels(false));
  }

  // 车辆 popover
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [applyingPopular, setApplyingPopular] = useState<string | null>(null);

  const vehicleSelected = subSelection != null;

  // 胶囊显示名 (从已加载的列表里反查 make/model 名字)
  const makeName = makes.find((m) => m.id === makeId)?.name ?? null;
  const modelName = models.find((m) => m.id === modelId)?.name ?? null;
  const subModelLabel =
    subSelection == null
      ? null
      : subSelection.kind === "all"
        ? "All submodels"
        : subSelection.opt.name;
  const capsuleLabel =
    subModelLabel && year && makeName && modelName
      ? `${year} ${makeName} ${modelName} (${subModelLabel})`
      : "Select vehicle";

  // 点 Popular vehicle: 反查 id → 依次加载并选中 year/make/model, 载入 submodel
  // 列表并默认 All (用户可再手动挑 trim)。popover 保持打开。
  async function applyPopular(p: {
    year: number;
    makeName: string;
    modelName: string;
  }) {
    const key = `${p.year} ${p.makeName} ${p.modelName}`;
    setApplyingPopular(key);
    setError(null);
    try {
      const resolved = await fetch(
        `/api/vehicles/resolve?year=${p.year}&make=${encodeURIComponent(
          p.makeName
        )}&model=${encodeURIComponent(p.modelName)}`
      );
      if (!resolved.ok) throw new Error("resolve failed");
      const { makeId: mId, modelId: mdId } = await resolved.json();

      // 依次加载列表 + 选中 (下拉需要列表里有对应 option 才能显示名字)
      setYear(p.year);
      setSubSelection(null);
      const makesData: NamedOpt[] = await fetch(
        `/api/vehicles/makes?year=${p.year}`
      ).then((r) => r.json());
      setMakes(makesData);
      setMakeId(mId);
      const modelsData: NamedOpt[] = await fetch(
        `/api/vehicles/models?year=${p.year}&makeId=${mId}`
      ).then((r) => r.json());
      setModels(modelsData);
      setModelId(mdId);
      const subsData: SubModelOpt[] = await fetch(
        `/api/vehicles/submodels?year=${p.year}&makeId=${mId}&modelId=${mdId}`
      ).then((r) => r.json());
      setSubmodels(subsData);
      setSubSelection(allSelectionFrom(subsData)); // 默认 All
    } catch {
      setError(`Couldn't load ${key}`);
    } finally {
      setApplyingPopular(null);
    }
  }

  function clearVehicle() {
    setYear(null);
    setMakeId(null);
    setModelId(null);
    setSubSelection(null);
    setMakes([]);
    setModels([]);
    setSubmodels([]);
  }

  async function handleSearch() {
    if (!subSelection || !partDescription) return;
    setError(null);
    setSearching(true);
    setResult(null);
    resetSelections(); // 新搜索清空上一次的报价选择 (labor/tax 参数保留)
    // 快照 vehicle + part 给 PDF 用 (subSelection/makeName/modelName 此刻都有值)
    const vLabel =
      makeName && modelName
        ? subSelection.kind === "one"
          ? `${year} ${makeName} ${modelName} ${subSelection.opt.name}`
          : `${year} ${makeName} ${modelName}`
        : capsuleLabel;
    setQuoteContext(vLabel, partDescription);
    try {
      const res = await fetch("/api/search-vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 二选一: 具体 sub-model 传 vehicleId, All 传 baseVehicleId
          ...(subSelection.kind === "one"
            ? { vehicleId: subSelection.opt.vehicleId }
            : { baseVehicleId: subSelection.baseVehicleId }),
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

      {/* 车辆胶囊 + 零件表单 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6">
        {/* Row 1: Vehicle 胶囊 + Part Description + Part Number (同行) */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          {/* 车辆胶囊 + popover */}
          <div className="relative shrink-0">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
              Vehicle
            </div>
            <button
              type="button"
              onClick={() => setPopoverOpen((o) => !o)}
              className="mt-1 flex items-center gap-2 w-full sm:min-w-[220px] px-3 py-2 rounded-full border border-gray-300 bg-white text-sm text-[#1A1A2E] hover:border-gray-400 transition"
            >
              <Car size={14} className="text-gray-500 shrink-0" />
              <span className="truncate">{capsuleLabel}</span>
              <ChevronDown size={14} className="text-gray-400 shrink-0 ml-auto" />
            </button>

            {popoverOpen && (
              <>
                {/* 点外部关闭 (透明全屏 backdrop) */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setPopoverOpen(false)}
                />
                {/* popover 面板 */}
                <div className="absolute left-0 top-full mt-2 z-50 w-[560px] max-w-[calc(100vw-3rem)] bg-white border border-gray-200 rounded-xl shadow-xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-sm font-medium text-[#1A1A2E]">
                      Add your vehicle to ensure fitment
                    </h3>
                    <button
                      type="button"
                      onClick={clearVehicle}
                      className="text-xs text-gray-500 hover:text-red-600 transition whitespace-nowrap"
                    >
                      Clear vehicle
                    </button>
                  </div>

                  {/* Popular vehicles */}
                  <div className="mt-4">
                    <div className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
                      Popular vehicles
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {POPULAR.map((p) => {
                        const key = `${p.year} ${p.makeName} ${p.modelName}`;
                        const loading = applyingPopular === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => applyPopular(p)}
                            disabled={applyingPopular != null}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-[13px] text-gray-600 hover:border-gray-300 disabled:opacity-60 transition"
                          >
                            {loading && (
                              <Loader2 size={12} className="animate-spin" />
                            )}
                            {key}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4 层级联下拉 */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
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
                      value={
                        subSelection == null
                          ? ""
                          : subSelection.kind === "all"
                            ? ALL_SUBMODELS
                            : subSelection.opt.id
                      }
                      onChange={(v) => {
                        if (!v) return setSubSelection(null);
                        if (v === ALL_SUBMODELS) {
                          return setSubSelection(allSelectionFrom(submodels));
                        }
                        const opt = submodels.find((s) => s.id === Number(v));
                        setSubSelection(opt ? { kind: "one", opt } : null);
                      }}
                      placeholder={
                        modelId == null ? "Select model first" : "Select sub-model"
                      }
                      // 列表加载后默认就是 All, 空占位项不再是有意义的状态,
                      // 留着只会让用户误选进「没选车」而 Search 被禁用
                      hidePlaceholder={submodels.length > 0}
                      options={[
                        ...(submodels.length > 0
                          ? [{ value: ALL_SUBMODELS, label: "All (any submodel)" }]
                          : []),
                        ...submodels.map((s) => ({ value: s.id, label: s.name })),
                      ]}
                    />
                  </div>

                  {/* Done */}
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setPopoverOpen(false)}
                      disabled={!vehicleSelected}
                      className="px-4 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00A396] disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Part Description (占剩余空间) */}
          <div className="flex-1">
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

          {/* Part Number (固定宽) */}
          <div className="shrink-0 sm:w-[200px]">
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

        {/* Row 2: Job Status 胶囊 (左) + Search eBay (右). 始终显示;
            未选车时 Search 禁用但可见 */}
        <div className="mt-6 pt-6 border-t border-gray-100 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
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

          <button
            onClick={handleSearch}
            disabled={searching || !partDescription || !vehicleSelected}
            title={!vehicleSelected ? "Select a vehicle first" : undefined}
            className="sm:ml-auto shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00A396] disabled:opacity-40 disabled:cursor-not-allowed transition"
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
            <CandidateTable candidates={verified} />
          )}

          {others.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowOthers((s) => !s)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-600 hover:bg-gray-100 transition"
              >
                <span className="uppercase tracking-wide font-medium">
                  Other candidates ({others.length})
                  <span className="text-gray-400 ml-1 normal-case tracking-normal font-normal">
                    (uncertain / rejected)
                  </span>
                </span>
                {showOthers ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
              {showOthers && (
                <div className="mt-2">
                  <CandidateTable candidates={others} />
                </div>
              )}
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
  hidePlaceholder = false,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  value: number | string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: number | string; label: string }[];
  hidePlaceholder?: boolean;
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
        {!hidePlaceholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
