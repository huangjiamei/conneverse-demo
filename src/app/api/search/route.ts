/**
 * POST /api/search
 *
 * Body: { partLineId: string, useLlm?: boolean }
 *
 * 流程:
 *   1. 用 Prisma 从 DB 读 PartLine + RepairOrder,组装 source_part_info
 *   2. 调 Python matcher 服务 (MATCHER_URL/api/match)
 *   3. 把返回结果存进 MatchSearch + Candidate(审计留档)
 *   4. 返回给前端可消费的 JSON
 *
 * MVP 阶段不套 withApi 的 session gate(用 curl 验证不方便)。
 * 前端接入时再套回来。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MATCHER_URL = process.env.MATCHER_URL ?? "http://127.0.0.1:8001";

type Body = {
  partLineId?: string;
  useLlm?: boolean;
};

// Matcher 返回的候选形状(只挑 route 会用到的字段)
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

type MatcherResponse = {
  source_part_info?: unknown;
  candidate_info_list?: MatcherCandidate[];
  label?: number | null;
  label_source?: string;
  dataset_meta?: Record<string, unknown>;
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

  // 1. 从数据库读 PartLine + RepairOrder
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

  // 2. 组装 source_part_info(matcher 期待的形状)
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

  // 3. 调 matcher
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
    // matcher 服务没起来 / 网络问题
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

  // 4. 存 MatchSearch + Candidate(审计留档)
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
        create: candidates.map((c: MatcherCandidate, idx: number) => ({
          rank: idx + 1,
          ebayItemId: c.item_id ?? "",
          title: c.title ?? "",
          price: c.price?.value ? c.price.value : "0",
          currency: c.price?.currency ?? "USD",
          itemUrl: c.item_web_url ?? "",
          condition: c.condition ?? null,
          candidateLabel: c.candidate_label ?? null,
          labelSource: c.candidate_label_source ?? null,
        })),
      },
    },
    include: { candidates: true },
  });

  // 5. 返回给前端
  return NextResponse.json({
    matchSearchId: matchSearch.id,
    label: matcherData.label,
    labelSource: matcherData.label_source,
    candidateCount: candidates.length,
    candidates: matchSearch.candidates.map((c:any) => ({
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
    })),
    meta: {
      matcherDurationMs,
      query: sourcePartInfo,
    },
  });
}