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
  Loader2,
  Search,
  Car,
  ChevronDown,
  Clock,
  ScanLine,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { normalizeVin, vinError, VIN_LENGTH } from "@/lib/vehicle/vin";
import { type Candidate } from "@/components/CandidateCard";
import { DEFAULT_PRESET } from "@/lib/presets";
import { applyPositions } from "@/constants/positionWords";
import UserResults from "@/app/results/[id]/UserResults";
import type { UserResultsPayload } from "@/lib/userResultsData";

// Popular vehicles —— 前端硬编码, 点一下用 /api/vehicles/resolve 反查 id 再填下拉。
// 注意: "Silverado" 在 VCdb 里不存在, 实际叫 "Silverado 1500"。
const POPULAR = [
  { year: 2022, makeName: "Toyota", modelName: "Camry" },
  { year: 2021, makeName: "Ford", modelName: "F-150" },
  { year: 2023, makeName: "Honda", modelName: "Civic" },
  { year: 2022, makeName: "Toyota", modelName: "RAV4" },
  { year: 2021, makeName: "Chevrolet", modelName: "Silverado 1500" },
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

// /api/vehicles/decode-vin 的返回。三种 status 都是 200 —— 对不上是正常剧情。
type VinDecoded = {
  modelYear: number | null;
  make: string | null;
  model: string | null;
  series: string | null;
  trim: string | null;
  bodyClass: string | null;
  clean: boolean;
  errorText: string | null;
};
type VinPrefill = { year: number | null; makeId: number | null; makeName: string | null };
type VinDecodeResponse =
  | {
      status: "resolved";
      vin: string;
      decoded: VinDecoded;
      confidence: "exact" | "fuzzy";
      vehicle: {
        year: number;
        makeId: number;
        makeName: string;
        modelId: number;
        modelName: string;
        baseVehicleId: number;
      };
    }
  | {
      status: "ambiguous";
      vin: string;
      decoded: VinDecoded;
      reason: string;
      prefill: VinPrefill;
      candidates: NamedOpt[];
    }
  | {
      status: "unmatched";
      vin: string;
      decoded: VinDecoded;
      reason: string;
      prefill: VinPrefill;
    };

// 车辆选择器的两个互斥入口。一次只渲染一个面板。
type VehicleTab = "manual" | "vin";

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

export default function VehicleSearchClient({
  isPlatformAdmin,
}: {
  /** 只有平台管理员能进 /search/history/[id] 那张内部表格 */
  isPlatformAdmin: boolean;
}) {
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

  // 车辆选择器: 两个互斥 tab (下拉 / VIN), 默认下拉
  const [vehicleTab, setVehicleTab] = useState<VehicleTab>("manual");

  // VIN 入口 (可选; 手动选择器不依赖它)
  const [vin, setVin] = useState("");
  const [vinMsg, setVinMsg] = useState<string | null>(null); // 格式错误 / 请求失败
  const [vinDecoding, setVinDecoding] = useState(false);
  // 年份+品牌都没解出来 → 留在 VIN tab 的那一行失败提示
  const [vinFailure, setVinFailure] = useState<string | null>(null);
  // 解出来了但 NHTSA 标了问题 (最常见是校验位) —— 一行, 跟着预填的表单走
  const [vinCaution, setVinCaution] = useState<string | null>(null);

  // 各层 loading
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingSubmodels, setLoadingSubmodels] = useState(false);

  // Job Status 选择器已下线,排序视角固定为默认 preset (后端仍按它排)
  const preset = DEFAULT_PRESET;

  // 零件信息 + 搜索
  const [partDescription, setPartDescription] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [matchSearchId, setMatchSearchId] = useState<string | null>(null);
  // 结果内联在本页渲染 (不再跳 /results/[id])
  const [userResults, setUserResults] = useState<UserResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // 用户一动下拉, VIN 那边的提示就过期了
  function clearVinFeedback() {
    setVinFailure(null);
    setVinCaution(null);
  }

  function selectYear(newYear: number | null) {
    setYear(newYear);
    clearVinFeedback();
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
    clearVinFeedback();
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
    clearVinFeedback(); // 车型一旦选定, VIN 的「挑一个车型」提示就完成使命了
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

  /**
   * 按 id 依次加载各层列表并选中 —— Popular vehicles 和 VIN 解码共用。
   * 下拉要显示名字就得先有对应的 option, 所以只能串行, 一层一层来。
   * mId / mdId 传 null = 这一层没解析出来, 加载完上一层列表就停在那儿,
   * 用户接着手选 (VIN 对不上时的回退路径)。
   */
  async function applyVehicleIds(y: number, mId: number | null, mdId: number | null) {
    setYear(y);
    setMakeId(null);
    setModelId(null);
    setSubSelection(null);
    setModels([]);
    setSubmodels([]);

    const makesData = await getJson<NamedOpt[]>(`/api/vehicles/makes?year=${y}`);
    setMakes(makesData);
    if (mId == null) return;
    setMakeId(mId);

    const modelsData = await getJson<NamedOpt[]>(
      `/api/vehicles/models?year=${y}&makeId=${mId}`
    );
    setModels(modelsData);
    if (mdId == null) return;
    setModelId(mdId);

    const subsData = await getJson<SubModelOpt[]>(
      `/api/vehicles/submodels?year=${y}&makeId=${mId}&modelId=${mdId}`
    );
    setSubmodels(subsData);
    setSubSelection(allSelectionFrom(subsData)); // 默认 All
  }

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
    clearVinFeedback();
    try {
      const { makeId: mId, modelId: mdId } = await getJson<{
        makeId: number;
        modelId: number;
      }>(
        `/api/vehicles/resolve?year=${p.year}&make=${encodeURIComponent(
          p.makeName
        )}&model=${encodeURIComponent(p.modelName)}`
      );
      await applyVehicleIds(p.year, mId, mdId);
    } catch {
      setError(`Couldn't load ${key}`);
    } finally {
      setApplyingPopular(null);
    }
  }

  // ---- VIN 解码 ----------------------------------------------------------

  // 打字途中不催长度 (会一直红着), 只在出现非法字符或已凑满 17 位时提示。
  function onVinChange(raw: string) {
    const cleaned = normalizeVin(raw).slice(0, VIN_LENGTH);
    setVin(cleaned);
    clearVinFeedback();
    const hasIllegalChar = /[^A-HJ-NPR-Z0-9]/.test(cleaned);
    setVinMsg(
      cleaned.length > 0 && (hasIllegalChar || cleaned.length === VIN_LENGTH)
        ? vinError(cleaned)
        : null
    );
  }

  async function decodeVinInput() {
    const cleaned = normalizeVin(vin);
    setVin(cleaned);
    clearVinFeedback();

    // 格式不对就地拦下, 不打后端
    const formatErr = vinError(cleaned);
    if (formatErr) {
      setVinMsg(formatErr);
      return;
    }
    setVinMsg(null);
    setVinDecoding(true);
    // 只拿 VIN 去解, 不把 Year/Make/Model tab 的年份当 hint 传过去。
    // 两个 tab 是互斥入口, 而且解码成功后就切到那个 tab, 年份必然是填着的 ——
    // 再解下一条 VIN 时那个陈年年份会被带上, vPIC 一旦对不上 10 位年份码就
    // 直接返回 model: null (整车退化成 year+make)。宁可少一点年份提示:
    // vPIC 猜错年份的话, 预填表单里的 Year 下拉改一下就行。
    try {
      const res = await fetch(`/api/vehicles/decode-vin?vin=${cleaned}`);
      const data = await res.json();
      if (!res.ok) {
        setVinMsg(
          (data?.error as string) ??
            `VIN lookup failed (HTTP ${res.status}). Re-enter it, or switch to Year / Make to pick manually.`
        );
        return;
      }
      await applyVinResult(data as VinDecodeResponse);
    } catch {
      setVinMsg(
        "Couldn't reach the VIN decoder. Re-enter it, or switch to Year / Make to pick manually."
      );
    } finally {
      setVinDecoding(false);
    }
  }

  /**
   * VIN 解码没有自己的结果卡片 —— 解出来的值直接灌进 Year/Make/Model 那张表单,
   * 填好的下拉本身就是确认, 用户接着改哪层都行, 照常 Done。
   *
   * 年份+品牌都拿到 → 切到 Year/Make/Model tab 并预填 (Model 没唯一命中就留空,
   * 同一张表单接手)。连年份+品牌都没有 → 表单没什么可填的, 留在 VIN tab 给一行。
   */
  async function applyVinResult(data: VinDecodeResponse) {
    // NHTSA 自己都标了问题 (最常见是校验位对不上) —— 不拦, 但要让用户知道
    const checkDigitNote = data.decoded.clean
      ? null
      : `${stripErrorCode(data.decoded.errorText)} Please double-check the VIN.`;

    if (data.status === "resolved") {
      const v = data.vehicle;
      await applyVehicleIds(v.year, v.makeId, v.modelId); // sub-model 静默停在 All
      setVinCaution(checkDigitNote);
      setVehicleTab("manual");
      return;
    }

    // 年份+品牌对上了 (ambiguous 必然如此) → Model 空着让用户在已收窄的列表里点
    if (data.prefill.year != null && data.prefill.makeId != null) {
      await applyVehicleIds(data.prefill.year, data.prefill.makeId, null);
      setVinCaution(checkDigitNote);
      setVehicleTab("manual");
      return;
    }

    // 解不出车 —— 不猜, 不预填任何一层
    setVinFailure(
      checkDigitNote ??
        `${decodeFailureReason(data)} Re-enter it, or switch to Year / Make to pick manually.`
    );
  }

  function clearVehicle() {
    setYear(null);
    setMakeId(null);
    setModelId(null);
    setSubSelection(null);
    setMakes([]);
    setModels([]);
    setSubmodels([]);
    setVin("");
    setVinMsg(null);
    clearVinFeedback();
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
    setUserResults(null);
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
      setMatchSearchId(data.matchSearchId ?? null);
      setResult(data);
      // 结果就在本页下方渲染 —— 客户视图的卡片由 /api/results/[id] 组装
      // (heroes/alternates 的挑选要读三份 preset 排名,只有服务端有)
      if (data.matchSearchId) {
        await loadUserResults(data.matchSearchId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  // 客户视图结果 (heroes / alternates) —— 服务端按三份 preset 排名挑好后返回
  async function loadUserResults(id: string) {
    try {
      const res = await fetch(`/api/results/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUserResults((await res.json()) as UserResultsPayload);
    } catch {
      // 结果拿不到不算搜索失败 —— 上面的 result 里已有计数,给一句提示即可
      setError("Search finished, but the results could not be loaded. Reload to retry.");
    }
  }

  // 能不能搜 —— 放大镜按钮和 Enter 共用同一个判断
  // 不能搜时的具体原因 —— 按钮 title 和输入框下方的提示共用。
  // 之前只有 title 悬浮提示, 键盘用户和没悬停的人完全不知道为什么点不动。
  const blockReason: string | null = searching
    ? null
    : !vehicleSelected
      ? "Select a vehicle to search."
      : partDescription.trim() === ""
        ? "Enter a part to search."
        : null;
  const canSearch = !searching && blockReason === null;

  const heroCount =
    (userResults?.heroes.length ?? 0) + (userResults?.alternates.length ?? 0);

  return (
    <>
      {/* 页面工具条: 纯文字标题 + 右上角 Search History (深色 banner 已移除) */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-[#1A1A2E]">Search</h1>
        <Link
          href="/search/history"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] font-medium text-[#1A1A2E] transition hover:border-gray-400 hover:bg-gray-50"
        >
          <Clock size={13} />
          Search History
        </Link>
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

                  {/* 两个互斥入口: 一次只渲染一个面板 */}
                  <div
                    role="tablist"
                    aria-label="Vehicle entry method"
                    className="mt-4 flex gap-0.5 rounded-lg border border-gray-300 bg-gray-100 p-0.5"
                  >
                    {(
                      [
                        ["manual", "Year / Make / Model"],
                        ["vin", "VIN"],
                      ] as const
                    ).map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        id={`vehicle-tab-${tab}`}
                        aria-selected={vehicleTab === tab}
                        aria-controls={`vehicle-panel-${tab}`}
                        onClick={() => setVehicleTab(tab)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                          vehicleTab === tab
                            ? "bg-white text-[#1A1A2E] shadow-sm"
                            : "text-gray-600 hover:bg-white/50 hover:text-[#1A1A2E]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Tab A: Year / Make / Model —— 快捷车型 + 四层级联下拉 */}
                  <div
                    role="tabpanel"
                    id="vehicle-panel-manual"
                    aria-labelledby="vehicle-tab-manual"
                    hidden={vehicleTab !== "manual"}
                  >
                    {/* 预填的值来自一条 NHTSA 标了问题的 VIN —— 一行, 不拦 */}
                    {vinCaution && (
                      <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <AlertTriangle size={13} className="mt-px shrink-0 text-amber-600" />
                        <span>{vinCaution}</span>
                      </p>
                    )}

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

                  {/* Tab B: VIN —— 输入 + Decode, 命中就地确认, 没命中掉回 Tab A */}
                  <div
                    role="tabpanel"
                    id="vehicle-panel-vin"
                    aria-labelledby="vehicle-tab-vin"
                    hidden={vehicleTab !== "vin"}
                    className="mt-4"
                  >
                    <label
                      htmlFor="vin-input"
                      className="flex items-center gap-1.5 text-[11px] text-gray-500 uppercase tracking-wide font-medium"
                    >
                      <ScanLine size={12} className="text-gray-400" />
                      Decode VIN
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id="vin-input"
                        value={vin}
                        onChange={(e) => onVinChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (!vinDecoding) decodeVinInput();
                          }
                        }}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="17-character VIN"
                        aria-invalid={vinMsg != null}
                        className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono tracking-wider uppercase focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                      />
                      <button
                        type="button"
                        onClick={decodeVinInput}
                        disabled={vinDecoding || vin.length === 0}
                        className="inline-flex shrink-0 items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00A396] disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        {vinDecoding && <Loader2 size={13} className="animate-spin" />}
                        Decode
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-start justify-between gap-3">
                      <div className="text-xs text-red-600">{vinMsg}</div>
                      <div
                        className={`shrink-0 text-[11px] tabular-nums ${
                          vin.length === VIN_LENGTH ? "text-gray-400" : "text-gray-300"
                        }`}
                      >
                        {vin.length}/{VIN_LENGTH}
                      </div>
                    </div>

                    {/* 解不出车才有话说 —— 命中/半命中都直接切去那张填好的表单 */}
                    {vinFailure && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <AlertTriangle size={13} className="mt-px shrink-0 text-amber-600" />
                        <span>{vinFailure}</span>
                      </p>
                    )}
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

                {/* 搜索框 = partDescription (保留用户输入, 带方位)。
                    右侧放大镜就是提交按钮,Enter 等价 —— 没有单独的搜索按钮。 */}
                <div className="relative flex-1 min-w-0">
                  <input
                    value={partDescription}
                    onChange={(e) => onPartDescriptionChange(e.target.value)}
                    onFocus={() => {
                      if (selectedPartId == null) setResultsOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      setResultsOpen(false); // 收起联想列表,直接搜
                      if (canSearch) handleSearch();
                    }}
                    placeholder={
                      scopeSub
                        ? `Search in ${scopeSub.subCategoryName}…`
                        : scopeCat
                          ? `Search in ${scopeCat.name}…`
                          : "Search all parts…"
                    }
                    className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setResultsOpen(false);
                      handleSearch();
                    }}
                    disabled={!canSearch}
                    aria-label="Search"
                    title={blockReason ?? "Search"}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md transition ${
                      canSearch || searching
                        ? "bg-[#00B4A6] text-white hover:bg-[#00A396]"
                        : "cursor-not-allowed bg-gray-100 text-gray-300"
                    }`}
                  >
                    {searching ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Search size={15} />
                    )}
                  </button>
                </div>
              </div>

              {/* 点不动时把原因说出来, 而不是只给一个悬浮 title */}
              {blockReason && partDescription.trim() !== "" && (
                <p className="mt-1.5 text-xs text-amber-600">{blockReason}</p>
              )}

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

        {/* 没有独立的搜索按钮 —— 提交入口是 Part 输入框右侧的放大镜 / Enter。
            Job Status 选择器也已移除 (见 lib/presets.ts 的 SHOWN_PRESETS)。 */}

        {error && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>


      {/* ---- 结果:内联在搜索页下方,全宽 ---- */}
      {searching && (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Searching Conneverse…
        </div>
      )}

      {!searching && userResults && (
        <div className="mt-6">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-gray-500">
              Results ({heroCount})
            </h2>
            {/* 内部表格只给平台管理员 */}
            {isPlatformAdmin && matchSearchId && (
              <Link
                href={`/search/history/${matchSearchId}`}
                className="shrink-0 text-xs text-gray-400 transition hover:text-[#00B4A6]"
              >
                Admin view →
              </Link>
            )}
          </div>

          {heroCount === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
              No verified matches. Try adjusting the description or part number.
            </div>
          ) : (
            <UserResults
              context={userResults.context}
              heroes={userResults.heroes}
              alternates={userResults.alternates}
            />
          )}
        </div>
      )}
    </>
  );
}

// ============================================================
// 小工具
// ============================================================

/** fetch + 非 2xx 抛错 (级联那几个列表接口都是纯数组, 拿不到就该报错而不是渲染空列表) */
async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/**
 * vPIC 的 errorText 形如 "1 - Check Digit ... does not calculate properly; 7 - …",
 * 可能串一长条。只留第一条并去掉前面的码, 一行放得下。
 */
function stripErrorCode(text: string | null): string {
  const first = (text ?? "").split(";")[0] ?? "";
  const t = first.replace(/^[\d,\s]*-\s*/, "").trim();
  if (!t) return "This VIN didn't decode cleanly.";
  const sentence = t.endsWith(".") ? t : `${t}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * 连年份+品牌都没解出来时的那半句 —— 说清为什么, 调用方再接上「怎么办」。
 * 保持单句: VIN tab 上只给一行。
 * (ambiguous 永远带着 year+makeId, 走不到这儿, 落 default 也无妨。)
 */
function decodeFailureReason(
  data: Exclude<VinDecodeResponse, { status: "resolved" }>
): string {
  const d = data.decoded;
  switch (data.reason) {
    case "vpic_no_vehicle":
      return "NHTSA doesn't recognize this VIN.";
    case "year_missing":
      return "This VIN didn't decode to a model year.";
    case "year_not_in_vcdb":
      return `${d.modelYear} isn't in the parts catalog.`;
    case "make_missing":
      return "This VIN didn't decode to a make.";
    case "make_not_in_vcdb":
      return `Decoded make “${d.make}” isn't in the parts catalog.`;
    default:
      return "Couldn't decode this VIN.";
  }
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
