/**
 * POST /api/search-vehicle
 *
 * Body: { vehicleId: number, partDescription: string, partNumber?: string }
 *
 * 独立车辆搜索入口 (不落库)。用户在 /search 用 VCdb 级联下拉选定一辆
 * 具体车 (vehicleId), 直接跑 matcher 拿候选, 不创建 RepairOrder / PartLine。
 *
 * 与 /api/search 的区别:
 *   - /api/search 从已存的 PartLine 出发, 结果写 MatchSearch/Candidate/缓存
 *   - 这里从 VcdbVehicle 出发, 结果只返回不落库 (candidate.id 用 ebayItemId)
 *
 * 返回形状与 /api/search 对齐, 前端可复用同一个 CandidateCard。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MATCHER_URL = process.env.MATCHER_URL ?? "http://127.0.0.1:8001";

// 默认 preset —— 本页暂不做 preset 选择器, 后续再加。
const DEFAULT_PRESET = "sameDayJob";

type Body = {
  vehicleId?: number;
  partDescription?: string;
  partNumber?: string | null;
};

type MatcherOptimizerFields = {
  seller_username?: string | null;
  seller_feedback_pct?: string | number | null;
  seller_feedback_count?: number | null;
  top_rated?: boolean | null;
  availability_status?: string | null;
  available_qty?: number | null;
  sold_qty?: number | null;
  shipping_cost?: string | number | null;
  delivery_min_date?: string | null;
  delivery_max_date?: string | null;
  returns_accepted?: boolean | null;
  return_period_days?: number | null;
  warranty_raw?: string | null;
  country?: string | null;
};

type MatcherCandidate = {
  title?: string;
  compatibility?: Record<string, unknown>;
  condition?: string;
  item_id?: string;
  item_web_url?: string;
  price?: { value?: string; currency?: string } | null;
  candidate_label?: number | null;
  candidate_label_source?: string;
  optimizer_fields?: MatcherOptimizerFields;
  image_url?: string | null;
  additional_image_urls?: string[];
};

type OptimizerResult = {
  preset_used?: string;
  eligible?: Array<{
    item_id: string;
    rank: number;
    total: number;
    price_score: number;
    quality_score: number;
  }>;
  rejected?: Array<{ item_id: string; reason: string }>;
  meta?: Record<string, unknown>;
};

type MatcherResponse = {
  candidate_info_list?: MatcherCandidate[];
  label?: number | null;
  label_source?: string;
  optimizer_result?: OptimizerResult;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { vehicleId, partDescription, partNumber } = body;
  if (!Number.isInteger(vehicleId) || !partDescription) {
    return NextResponse.json(
      { error: "Body must include { vehicleId: int, partDescription: string }" },
      { status: 400 }
    );
  }

  // vehicleId → 年份 / 品牌 / 车型 / 子型号
  const vehicle = await prisma.vcdbVehicle.findUnique({
    where: { id: vehicleId! },
    select: {
      subModel: { select: { name: true } },
      baseVehicle: {
        select: {
          yearId: true,
          make: { select: { name: true } },
          model: { select: { name: true } },
        },
      },
    },
  });

  if (!vehicle) {
    return NextResponse.json(
      { error: `Vehicle not found: ${vehicleId}` },
      { status: 404 }
    );
  }

  const { yearId } = vehicle.baseVehicle;
  const makeName = vehicle.baseVehicle.make.name;
  const modelName = vehicle.baseVehicle.model.name;
  const subModelName = vehicle.subModel.name;

  const sourcePartInfo = {
    vehicle: {
      year: String(yearId),
      make: makeName,
      model_guess: modelName,
      vehicle_raw: `${yearId} ${makeName} ${modelName} ${subModelName}`,
    },
    part_description: partDescription,
    part_type: "",
    part_number: partNumber ?? "",
  };

  let matcherRes: Response;
  try {
    matcherRes = await fetch(`${MATCHER_URL}/api/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_part_info: sourcePartInfo,
        use_llm: false,
        preset: DEFAULT_PRESET,
      }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to reach matcher service", detail, matcherUrl: MATCHER_URL },
      { status: 502 }
    );
  }

  if (!matcherRes.ok) {
    const errText = await matcherRes.text();
    return NextResponse.json(
      {
        error: "Matcher service returned an error",
        status: matcherRes.status,
        detail: errText.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const matcherData = (await matcherRes.json()) as MatcherResponse;
  const candidates = matcherData.candidate_info_list ?? [];
  const optimizerResult = matcherData.optimizer_result;

  // optimizer lookup (rank/score/gate reason)
  const optimizerByItemId = new Map<
    string,
    {
      rank?: number;
      total?: number;
      priceScore?: number;
      qualityScore?: number;
      gateReason?: string;
    }
  >();
  for (const e of optimizerResult?.eligible ?? []) {
    optimizerByItemId.set(e.item_id, {
      rank: e.rank,
      total: e.total,
      priceScore: e.price_score,
      qualityScore: e.quality_score,
    });
  }
  for (const r of optimizerResult?.rejected ?? []) {
    optimizerByItemId.set(r.item_id, { gateReason: r.reason });
  }

  // 组装前端候选形状 (id 用 ebayItemId, 因为不落库没有 Candidate.id)
  const shaped = candidates.map((c, idx) => {
    const itemId = c.item_id ?? `idx-${idx}`;
    const opt = optimizerByItemId.get(c.item_id ?? "") || {};
    const compat = c.compatibility || {};
    const brand = (compat.Brand as string) || (compat.Make as string) || null;
    return {
      id: itemId,
      rank: idx + 1,
      title: c.title ?? "",
      price: c.price?.value ? c.price.value : "0",
      currency: c.price?.currency ?? "USD",
      itemUrl: c.item_web_url ?? "",
      imageUrl: c.image_url ?? null,
      condition: c.condition ?? null,
      candidateLabel: c.candidate_label ?? null,
      labelSource: c.candidate_label_source ?? null,
      ebayItemId: itemId,
      optimizerRank: opt.rank ?? null,
      optimizerTotal: opt.total ?? null,
      optimizerPriceScore: opt.priceScore ?? null,
      optimizerQualityScore: opt.qualityScore ?? null,
      optimizerGateReason: opt.gateReason ?? null,
      brand,
      enrichedFields: c.optimizer_fields ?? null,
      compatibility: compat,
      additionalImageUrls: c.additional_image_urls ?? [],
    };
  });

  // 排序: 有 optimizerRank 的在前, 其余按 matcher 原序
  const sorted = [...shaped].sort((a, b) => {
    const ar = a.optimizerRank;
    const br = b.optimizerRank;
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1;
    if (br != null) return 1;
    return a.rank - b.rank;
  });

  return NextResponse.json({
    label: matcherData.label ?? null,
    labelSource: matcherData.label_source ?? null,
    candidateCount: candidates.length,
    preset: DEFAULT_PRESET,
    optimizerMeta: {
      preset: optimizerResult?.preset_used ?? DEFAULT_PRESET,
      eligibleCount: optimizerResult?.meta?.total_eligible ?? 0,
      rejectedCount: optimizerResult?.meta?.total_rejected ?? 0,
    },
    candidates: sorted,
    query: sourcePartInfo,
  });
}
