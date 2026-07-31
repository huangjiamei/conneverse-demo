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
  Loader2, Search, Gauge, Scale, DollarSign, Award, Car,
  ChevronDown, ChevronUp, X, Clock,
} from "lucide-react";
import Link from "next/link";
import { type Candidate } from "@/components/CandidateCard";
import { CandidateTable } from "./CandidateTable";
import { PRESET_META, PRESET_COLORS } from "./presetMeta";
import { useSourcing } from "./SourcingContext";
import { applyPositions } from "@/constants/positionWords";

// Popular vehicles —— 前端硬编码, 点一下用 /api/vehicles/resolve 反查 id 再填下拉。
// 注意: "Silverado" 在 VCdb 里不存在, 实际叫 "Silverado 1500"。
const POPULAR = [
  { year: 2022, makeName: "Toyota", modelName: "Camry" },
  { year: 2021, makeName: "Ford", modelName: "F-150" },
  { year: 2023, makeName: "Honda", modelName: "Civic" },
  { year: 2022, makeName: "Toyota", modelName: "RAV4" },
  { year: 2021, makeName: "Chevrolet", modelName: "Silverado 1500" },
] as const;

// Job Status preset 胶囊 —— key 与 matcher V2 的 preset 对齐
const PRESET_OPTIONS = [
  { key: "Rush", label: "Rush", Icon: Gauge },
  { key: "Balanced", label: "Balanced", Icon: Scale },
  { key: "Budget", label: "Budget", Icon: DollarSign },
  { key: "Premium", label: "Premium", Icon: Award },
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

type CategoryOpt = { id: number; name: string };
type SubCategoryOpt = { subCategoryId: number; subCategoryName: string };
type PartOpt = { partId: number; partName: string };
type PartSearchResult = {
  partId: number;
  partName: string;
  subCategoryId: number;
  subCategoryName: string;
  categoryId: number;
  categoryName: string;
};

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

  // Job Status preset (默认 Balanced)
  const [preset, setPreset] = useState<string>("Balanced");
  const [switchingPreset, setSwitchingPreset] = useState<string | null>(null);

  // 零件信息 + 搜索
  const [partDescription, setPartDescription] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [matchSearchId, setMatchSearchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  // PCdb: 分类级联下拉 + 搜索为主
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [catMenuOpen, setCatMenuOpen] = useState(false); // 级联下拉是否展开
  const [menuExpandedCat, setMenuExpandedCat] = useState<number | null>(null); // 菜单内手风琴展开的大类
  const [subcategories, setSubcategories] = useState<SubCategoryOpt[]>([]);
  const [loadingSubcategories, setLoadingSubcategories] = useState(false);
  // 已提交的搜索范围 (存对象拿名字做入口标签)
  const [scopeCat, setScopeCat] = useState<CategoryOpt | null>(null);
  const [scopeSub, setScopeSub] = useState<SubCategoryOpt | null>(null);
  // 分类来源: 'user'=用户主动从下拉选; 'auto'=选 Part 自动填。决定何时清。
  const [categorySource, setCategorySource] = useState<"user" | "auto" | null>(null);
  // scopeSub 选中时浏览它的 Part 列表 (无输入时展示)
  const [parts, setParts] = useState<PartOpt[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  // 搜索框 (= partDescription) 的结果下拉
  const [searchResults, setSearchResults] = useState<PartSearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [freeTextMode, setFreeTextMode] = useState(false);
  // 最终选中 (选了 Part → id 有值; 自由文本 → null)。子类/大类走 scope + source。
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);

  // Year 预取
  useEffect(() => {
    setLoadingYears(true);
    fetch("/api/vehicles/years")
      .then((r) => r.json())
      .then((data: YearOpt[]) => setYears(data))
      .catch(() => setError("Failed to load years"))
      .finally(() => setLoadingYears(false));
  }, []);

  // 26 大类预取
  useEffect(() => {
    fetch("/api/parts/categories")
      .then((r) => r.json())
      .then((data: CategoryOpt[]) => setCategories(data))
      .catch(() => {});
  }, []);

  // 搜索框 (= partDescription) debounce 300ms → /api/parts/search。
  // 已选中 Part 时不搜 (编辑框会先清 selectedPartId, 从而重新触发)。
  useEffect(() => {
    const q = partDescription.trim();
    if (!q || selectedPartId != null || freeTextMode) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }
    setLoadingSearch(true);
    const t = setTimeout(() => {
      // 范围按最细的选中层级: 子类 > 大类 > 全局
      const url =
        `/api/parts/search?q=${encodeURIComponent(q)}&limit=15` +
        (scopeCat ? `&categoryId=${scopeCat.id}` : "") +
        (scopeSub ? `&subCategoryId=${scopeSub.subCategoryId}` : "");
      fetch(url)
        .then((r) => r.json())
        .then((d: PartSearchResult[]) =>
          setSearchResults(Array.isArray(d) ? d : [])
        )
        .catch(() => setSearchResults([]))
        .finally(() => setLoadingSearch(false));
    }, 300);
    return () => clearTimeout(t);
  }, [partDescription, selectedPartId, freeTextMode, scopeCat, scopeSub]);

  // 级联菜单: 展开/折叠某大类看它的子类 (accordion, 一次一个)。不提交范围。
  function toggleMenuCategory(id: number) {
    const next = menuExpandedCat === id ? null : id;
    setMenuExpandedCat(next);
    setSubcategories([]);
    if (next == null) return;
    setLoadingSubcategories(true);
    fetch(`/api/parts/subcategories?categoryId=${next}`)
      .then((r) => r.json())
      .then((d: SubCategoryOpt[]) => setSubcategories(Array.isArray(d) ? d : []))
      .catch(() => setSubcategories([]))
      .finally(() => setLoadingSubcategories(false));
  }

  // 分类是自动填的 → 连同来源一起清 (Part 走了, auto 填的也走)
  function clearScopeIfAuto() {
    if (categorySource === "auto") {
      setScopeCat(null);
      setScopeSub(null);
      setParts([]);
      setCategorySource(null);
    }
  }

  // 选 "全部分类" → 清范围 (source=null, 即无过滤; 提交时不带分类)
  function selectAllScope() {
    setScopeCat(null);
    setScopeSub(null);
    setParts([]);
    setCategorySource(null);
    setCatMenuOpen(false);
  }

  // 用户主动选整个大类 (categoryId, 无 subCategory) → source='user'
  function selectCategoryScope(cat: CategoryOpt) {
    setScopeCat(cat);
    setScopeSub(null);
    setParts([]);
    setCategorySource("user");
    setCatMenuOpen(false);
  }

  // 用户主动选具体子类 → source='user', 顺带加载 Part 列表供浏览
  function selectSubcategoryScope(cat: CategoryOpt, sub: SubCategoryOpt) {
    setScopeCat(cat);
    setScopeSub(sub);
    setCategorySource("user");
    setCatMenuOpen(false);
    setPartDescription("");
    setSelectedPartId(null);
    setParts([]);
    setLoadingParts(true);
    fetch(
      `/api/parts/by-subcategory?subCategoryId=${sub.subCategoryId}&categoryId=${cat.id}`
    )
      .then((r) => r.json())
      .then((d: PartOpt[]) => setParts(Array.isArray(d) ? d : []))
      .catch(() => setParts([]))
      .finally(() => setLoadingParts(false));
    setResultsOpen(true);
  }

  // 选一个 Part → 最终描述 = 用户输入里的方位词 + Part 标准名。
  // 自动填该 Part 的归属分类到下拉 (source='auto', 覆盖之前的 user 选择, 更准确)。
  // pcdbPartId 始终存本体 id (不含方位)。
  function selectPart(
    partId: number,
    partName: string,
    subCategoryId: number,
    // 来自搜索结果时带上分类, 用来同步分类下拉 (浏览列表选的已经在 scope 内, 不传)
    category?: CategoryOpt,
    subCategory?: SubCategoryOpt
  ) {
    setPartDescription((prev) => applyPositions(prev, partName));
    setSelectedPartId(partId);
    if (category) setScopeCat(category);
    if (subCategory) setScopeSub(subCategory);
    setCategorySource("auto"); // 选 Part → 自动填分类
    setFreeTextMode(false);
    setResultsOpen(false);
  }

  // 编辑描述 → 解绑 Part; 分类若是 auto 填的也一起清 (重新搜)
  function onPartDescriptionChange(v: string) {
    setPartDescription(v);
    setSelectedPartId(null);
    clearScopeIfAuto();
    setResultsOpen(true);
  }

  // 清空输入框 (× 或删空) → 解绑 Part; auto 分类清, user 分类留
  function clearPartInput() {
    setPartDescription("");
    setSelectedPartId(null);
    setSearchResults([]);
    clearScopeIfAuto();
  }

  // 清空全部: 分类回全局 + 描述 + 选中 Part + 来源 全清
  function clearAll() {
    setScopeCat(null);
    setScopeSub(null);
    setCategorySource(null);
    setParts([]);
    setPartDescription("");
    setSelectedPartId(null);
    setFreeTextMode(false);
    setSearchResults([]);
    setResultsOpen(false);
    setMenuExpandedCat(null);
    setCatMenuOpen(false);
  }

  // 入口标签
  const scopeLabel = scopeSub
    ? `${scopeCat?.name ?? ""} › ${scopeSub.subCategoryName}`
    : scopeCat
      ? scopeCat.name
      : "All categories";

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
    // 提交的分类范围: 选了 Part → 用 Part 的(auto); 自由文本 → 只用 user 来源的
    // (auto 来源的分类在自由文本时排除, 虽然清除逻辑通常已把它清掉了)
    const usingScope = selectedPartId != null || categorySource === "user";
    const submitCategoryId = usingScope ? (scopeCat?.id ?? null) : null;
    const submitSubCategoryId = usingScope
      ? (scopeSub?.subCategoryId ?? null)
      : null;
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
          // 选了具体 Part 时带上 PCdb id, 自由文本时为 null
          pcdbPartId: selectedPartId,
          pcdbSubCategoryId: submitSubCategoryId,
          pcdbCategoryId: submitCategoryId,
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-white/50 tracking-wide">Vehicle lookup</div>
            <div className="mt-1 text-2xl font-semibold">New search</div>
            <div className="mt-1 text-xs text-white/40">
              Pick a vehicle from the ACES / VCdb catalog, then search parts — no
              repair order needed.
            </div>
          </div>
          <Link
            href="/search/history"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-white/80 text-xs hover:bg-white/10 transition"
          >
            <Clock size={13} />
            History
          </Link>
        </div>
      </div>

      {/* 车辆胶囊 + 零件表单 */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6">
        {/* Row 1: Vehicle 胶囊 + Part Number (同行) */}
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

        {/* 零件选择: 分类级联下拉 + 搜索为主 (+ 自由文本兜底) */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2 gap-3">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
              Part
            </div>
            {(scopeCat || partDescription) && (
              <button
                type="button"
                onClick={clearAll}
                className="shrink-0 text-xs text-gray-400 hover:text-red-600 transition"
              >
                Clear all
              </button>
            )}
          </div>

          {freeTextMode ? (
            /* 自由文本模式 */
            <div>
              <input
                value={partDescription}
                onChange={(e) => setPartDescription(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                placeholder="Describe the part, e.g. Front bumper cover"
              />
              <button
                type="button"
                onClick={() => setFreeTextMode(false)}
                className="mt-2 text-xs text-[#00B4A6] hover:underline"
              >
                ← Browse the catalog instead
              </button>
            </div>
          ) : (
            <div>
              {/* 一行: 分类级联下拉 + 搜索框 */}
              <div className="flex flex-col sm:flex-row gap-2">
                {/* 分类级联下拉 */}
                <div className="relative shrink-0 sm:w-[240px]">
                  <button
                    type="button"
                    onClick={() => setCatMenuOpen((o) => !o)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 transition"
                  >
                    <span className="truncate">{scopeLabel}</span>
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-gray-400 transition-transform ${catMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {catMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setCatMenuOpen(false)}
                      />
                      <div className="absolute left-0 top-full mt-1 z-40 w-full min-w-[240px] bg-white border border-gray-200 rounded-lg shadow-xl max-h-[360px] overflow-y-auto">
                        {/* 全部分类 */}
                        <button
                          type="button"
                          onClick={selectAllScope}
                          className={`w-full text-left px-3 py-2 text-sm border-b border-gray-50 transition ${
                            !scopeCat
                              ? "bg-teal-50 text-teal-700 font-medium"
                              : "text-[#1A1A2E] hover:bg-gray-50"
                          }`}
                        >
                          All categories
                        </button>
                        {categories.map((c) => {
                          const open = menuExpandedCat === c.id;
                          const catActive = scopeCat?.id === c.id && !scopeSub;
                          return (
                            <div
                              key={c.id}
                              className="border-b border-gray-50 last:border-b-0"
                            >
                              <button
                                type="button"
                                onClick={() => toggleMenuCategory(c.id)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition ${
                                  catActive
                                    ? "bg-teal-50 text-teal-700 font-medium"
                                    : "text-[#1A1A2E] hover:bg-gray-50"
                                }`}
                              >
                                <span className="truncate">{c.name}</span>
                                <ChevronDown
                                  size={14}
                                  className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
                                />
                              </button>
                              {open && (
                                <div className="bg-gray-50/50 pb-1">
                                  {/* 选整个大类 */}
                                  <button
                                    type="button"
                                    onClick={() => selectCategoryScope(c)}
                                    className="w-full text-left pl-5 pr-3 py-1.5 text-[13px] text-[#00B4A6] hover:bg-gray-100"
                                  >
                                    Search all of {c.name}
                                  </button>
                                  {loadingSubcategories ? (
                                    <div className="px-5 py-1.5 text-xs text-gray-400 inline-flex items-center gap-1.5">
                                      <Loader2 size={11} className="animate-spin" />{" "}
                                      Loading…
                                    </div>
                                  ) : (
                                    subcategories.map((sub) => {
                                      const activeSub =
                                        scopeSub?.subCategoryId === sub.subCategoryId;
                                      return (
                                        <button
                                          key={sub.subCategoryId}
                                          type="button"
                                          onClick={() => selectSubcategoryScope(c, sub)}
                                          className={`w-full text-left pl-5 pr-3 py-1.5 text-[13px] transition ${
                                            activeSub
                                              ? "text-teal-700 font-medium bg-teal-50"
                                              : "text-gray-600 hover:bg-gray-100"
                                          }`}
                                        >
                                          {sub.subCategoryName}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* 搜索框 = partDescription (保留用户输入, 带方位)。带 × 清空 */}
                <div className="relative flex-1 min-w-0">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    value={partDescription}
                    onChange={(e) => onPartDescriptionChange(e.target.value)}
                    onFocus={() => {
                      if (selectedPartId == null) setResultsOpen(true);
                    }}
                    placeholder={
                      scopeSub
                        ? `Search in ${scopeSub.subCategoryName}…`
                        : scopeCat
                          ? `Search in ${scopeCat.name}…`
                          : "Search all parts…"
                    }
                    className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                  />
                  {partDescription && (
                    <button
                      type="button"
                      onClick={clearPartInput}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* 结果: 有输入 → 搜索结果(面包屑); 无输入但选了子类 → 该子类 Part 列表 */}
              {resultsOpen &&
                selectedPartId == null &&
                (partDescription.trim() || scopeSub) && (
                <div className="mt-2 border border-gray-200 rounded-lg max-h-[320px] overflow-y-auto">
                  {partDescription.trim() ? (
                    <>
                      {loadingSearch && searchResults.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-gray-400 inline-flex items-center gap-1.5">
                          <Loader2 size={12} className="animate-spin" /> Searching…
                        </div>
                      ) : (
                        <>
                          {searchResults.length > 0 && (
                            <div className="divide-y divide-gray-50">
                              {searchResults.map((r) => (
                                <button
                                  key={r.partId}
                                  type="button"
                                  onClick={() =>
                                    selectPart(
                                      r.partId,
                                      r.partName,
                                      r.subCategoryId,
                                      { id: r.categoryId, name: r.categoryName },
                                      {
                                        subCategoryId: r.subCategoryId,
                                        subCategoryName: r.subCategoryName,
                                      }
                                    )
                                  }
                                  className={`w-full text-left px-3 py-2 transition ${
                                    selectedPartId === r.partId
                                      ? "bg-teal-50"
                                      : "hover:bg-gray-50"
                                  }`}
                                >
                                  <div className="text-sm text-[#1A1A2E]">{r.partName}</div>
                                  <div className="text-[11px] text-gray-400">
                                    {r.categoryName} › {r.subCategoryName}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {/* free text 入口: 有结果 → 列表底部低调; 无结果 → 唯一一条 */}
                          <button
                            type="button"
                            onClick={() => setResultsOpen(false)}
                            className={`w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition ${
                              searchResults.length > 0 ? "border-t border-gray-100" : ""
                            }`}
                          >
                            {searchResults.length > 0 ? (
                              "Use free text →"
                            ) : (
                              <>
                                Search{" "}
                                <span className="text-[#1A1A2E] font-medium">
                                  &ldquo;{partDescription.trim()}&rdquo;
                                </span>{" "}
                                as free text →
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </>
                  ) : scopeSub ? (
                    loadingParts ? (
                      <div className="px-3 py-3 text-xs text-gray-400 inline-flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" /> Loading parts…
                      </div>
                    ) : parts.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-gray-400">
                        No parts in this sub-category.
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {parts.map((p) => (
                          <button
                            key={p.partId}
                            type="button"
                            onClick={() =>
                              selectPart(p.partId, p.partName, scopeSub.subCategoryId)
                            }
                            className={`w-full text-left px-3 py-1.5 text-sm transition ${
                              selectedPartId === p.partId
                                ? "bg-teal-50 text-teal-700"
                                : "text-[#1A1A2E] hover:bg-gray-50"
                            }`}
                          >
                            {p.partName}
                          </button>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>
              )}
            </div>
          )}
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
                        ? "bg-[#00B4A6] border-[#00B4A6] text-white font-medium"
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
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
              Verified candidates ({verified.length})
              {result.optimizerMeta &&
                result.optimizerMeta.eligibleCount > 0 &&
                result.optimizerMeta.preset &&
                (() => {
                  const meta = PRESET_META[result.optimizerMeta.preset];
                  const color = PRESET_COLORS[result.optimizerMeta.preset];
                  if (!meta || !color) return null;
                  const { Icon } = meta;
                  return (
                    <span
                      style={{
                        backgroundColor: color.bg,
                        color: color.text,
                        borderColor: color.text,
                        borderWidth: "1.5px",
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold normal-case tracking-normal"
                    >
                      <Icon size={11} />
                      Ranked by {meta.label}
                    </span>
                  );
                })()}
            </h2>
          </div>

          {verified.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
              No verified matches. Try adjusting the description or part number.
            </div>
          ) : (
            <CandidateTable candidates={verified} currentPreset={preset} />
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
                  <CandidateTable candidates={others} currentPreset={preset} />
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
