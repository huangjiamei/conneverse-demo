/**
 * POST /api/search
 *
 * Body: { partLineId: string, useLlm?: boolean }
 *
 * 流程:
 *   1. 用 Prisma 从 DB 读 PartLine + RepairOrder,组装 source_part_info
 *   2. 调 Python matcher 服务 (MATCHER_URL/api/match)
 *   3. 把返回结果 (含 optimizer_result) 存进 MatchSearch + Candidate(审计留档)
 *   4. 返回给前端可消费的 JSON, 按 optimizerRank 排序
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MATCHER_URL = process.env.MATCHER_URL ?? "http://127.0.0.1:8001";

type Body = {
  partLineId?: string;
  useLlm?: boolean;
};

type MatcherCandidate = {
  title?: string;
  subtitle?: string;
  part_number_list?: string[];
  part_number_list_normalized?: string[];
  compatibility?: Record<string, unknown>;
  condition?: string;
  item_id?: string;
  item_web_url?: string;
  price?: { value?: string; currency?: string } | null;
  candidate_label?: number | null;
  candidate_label_source?: string;
};

type OptimizerEligible = {
  item_id: string;
  rank: number;
  total: number;
  price_score: number;
  quality_score: number;
};

type OptimizerRejected = {
  item_id: string;
  reason: string;
};

type OptimizerResult = {
  preset_used?: string;
  eligible?: OptimizerEligible[];
  rejected?: OptimizerRejected[];
  meta?: Record<string, unknown>;
};

type MatcherResponse = {
  source_part_info?: unknown;
  candidate_info_list?: MatcherCandidate[];
  label?: number | null;
  label_source?: string;
  dataset_meta?: Record<string, unknown>;
  optimizer_result?: OptimizerResult;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { partLineId, useLlm = false } = body;
  if (!partLineId) {
    return NextResponse.json(
      { error: "Body must include { partLineId: string }" },
      { status: 400 }
    );
  }

  const partLine = await prisma.partLine.findUnique({
    where: { id: partLineId },
    include: { repairOrder: true },
  });

  if (!partLine) {
    return NextResponse.json(
      { error: `PartLine not found: ${partLineId}` },
      { status: 404 }
    );
  }

  const ro = partLine.repairOrder;

  const sourcePartInfo = {
    vehicle: {
      year: String(ro.vehicleYear),
      make: ro.vehicleMake,
      model_guess: ro.vehicleModel,
      vehicle_raw: ro.vehicleRaw,
    },
    part_description: partLine.partDescription,
    part_type: partLine.partTypeRaw ?? "",
    part_number: partLine.partNumber ?? "",
  };

  const matcherStartMs = Date.now();
  let matcherRes: Response;
  try {
    matcherRes = await fetch(`${MATCHER_URL}/api/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_part_info: sourcePartInfo,
        use_llm: useLlm,
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
  const matcherDurationMs = Date.now() - matcherStartMs;
  const candidates = matcherData.candidate_info_list ?? [];
  const optimizerResult = matcherData.optimizer_result;

  // 建 optimizer lookup: item_id -> {rank, total, priceScore, qualityScore, gateReason}
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

  const matchSearch = await prisma.matchSearch.create({
    data: {
      partLineId: partLine.id,
      queryVehicleYear: ro.vehicleYear,
      queryVehicleMake: ro.vehicleMake,
      queryVehicleModel: ro.vehicleModel,
      queryPartDescription: partLine.partDescription,
      queryPartNumber: partLine.partNumber,
      matcherLabel: matcherData.label ?? null,
      labelSource: matcherData.label_source ?? null,
      candidateCount: candidates.length,
      rawResponse: matcherData as object,
      candidates: {
        create: candidates.map((c: MatcherCandidate, idx: number) => {
          const opt = optimizerByItemId.get(c.item_id ?? "") || {};
          return {
            rank: idx + 1,
            ebayItemId: c.item_id ?? "",
            title: c.title ?? "",
            price: c.price?.value ? c.price.value : "0",
            currency: c.price?.currency ?? "USD",
            itemUrl: c.item_web_url ?? "",
            condition: c.condition ?? null,
            candidateLabel: c.candidate_label ?? null,
            labelSource: c.candidate_label_source ?? null,
            optimizerRank: opt.rank ?? null,
            optimizerTotal: opt.total ?? null,
            optimizerPriceScore: opt.priceScore ?? null,
            optimizerQualityScore: opt.qualityScore ?? null,
            optimizerGateReason: opt.gateReason ?? null,
          };
        }),
      },
    },
    include: { candidates: true },
  });

  // 排序: 有 optimizerRank 的在前, 其他按原 matcher rank 排后面
  const sorted = [...matchSearch.candidates].sort((a, b) => {
    const ar = a.optimizerRank;
    const br = b.optimizerRank;
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1;
    if (br != null) return 1;
    return a.rank - b.rank;
  });

  return NextResponse.json({
    matchSearchId: matchSearch.id,
    label: matcherData.label,
    labelSource: matcherData.label_source,
    candidateCount: candidates.length,
    optimizerMeta: {
      preset: optimizerResult?.preset_used ?? null,
      eligibleCount: optimizerResult?.meta?.total_eligible ?? 0,
      rejectedCount: optimizerResult?.meta?.total_rejected ?? 0,
    },
    candidates: sorted.map((c) => ({
      id: c.id,
      rank: c.rank,
      title: c.title,
      price: c.price,
      currency: c.currency,
      itemUrl: c.itemUrl,
      condition: c.condition,
      candidateLabel: c.candidateLabel,
      labelSource: c.labelSource,
      ebayItemId: c.ebayItemId,
      optimizerRank: c.optimizerRank,
      optimizerTotal: c.optimizerTotal,
      optimizerPriceScore: c.optimizerPriceScore,
      optimizerQualityScore: c.optimizerQualityScore,
      optimizerGateReason: c.optimizerGateReason,
    })),
    meta: {
      matcherDurationMs,
      query: sourcePartInfo,
    },
  });
}