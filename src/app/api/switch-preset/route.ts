/**
 * POST /api/switch-preset
 *
 * Body: { matchSearchId: string, preset: string }
 *
 * 流程:
 *   1. 找 MatchSearch + Candidate 全部
 *   2. 查 OptimizerResult 表: (matchSearchId, preset) 有缓存? 
 *      - 命中: 直接读, 走 3.
 *      - 未命中: 从 rawResponse.candidate_info_list 取原始 candidate, 
 *                调 matcher /api/rerank, 存缓存, 走 3.
 *   3. 更新 Candidate 表 5 列 optimizer 字段 = 当前 preset 快照
 *   4. 更新 PartLine.selectedPreset (记住偏好)
 *   5. 返回排好序的 candidates
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MATCHER_URL = process.env.MATCHER_URL ?? "http://127.0.0.1:8001";

const VALID_PRESETS = ["sameDayJob", "costFirst", "qualityFirst", "scheduled"];

type Body = {
  matchSearchId?: string;
  preset?: string;
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

type RawCandidate = {
  item_id?: string;
  title?: string;
  condition?: string;
  price?: { value?: string; currency?: string } | null;
  compatibility?: Record<string, unknown>;
  candidate_label?: number | null;
  optimizer_fields?: MatcherOptimizerFields;
  additional_image_urls?: string[];
};

type RerankResult = {
  optimizer_result: {
    preset_used: string;
    eligible: Array<{
      item_id: string;
      rank: number;
      total: number;
      price_score: number;
      quality_score: number;
    }>;
    rejected: Array<{ item_id: string; reason: string }>;
    meta: Record<string, unknown>;
  };
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { matchSearchId, preset } = body;
  if (!matchSearchId || !preset) {
    return NextResponse.json(
      { error: "Body must include { matchSearchId, preset }" },
      { status: 400 }
    );
  }
  if (!VALID_PRESETS.includes(preset)) {
    return NextResponse.json(
      { error: `Invalid preset: ${preset}. Valid: ${VALID_PRESETS.join(", ")}` },
      { status: 400 }
    );
  }

  // 拿 MatchSearch + candidates (含现有 optimizer 5 列, 稍后会更新)
  const matchSearch = await prisma.matchSearch.findUnique({
    where: { id: matchSearchId },
    include: {
      candidates: { orderBy: { rank: "asc" } },
      partLine: true,
    },
  });

  if (!matchSearch) {
    return NextResponse.json(
      { error: `MatchSearch not found: ${matchSearchId}` },
      { status: 404 }
    );
  }

  // 1. 查缓存
  const cached = await prisma.optimizerResult.findMany({
    where: { matchSearchId, preset },
  });

  type OptimResult = {
    rank: number | null;
    total: number | null;
    priceScore: number | null;
    qualityScore: number | null;
    gateReason: string | null;
  };
  const resultByCandidateId = new Map<string, OptimResult>();

  let cacheHit = false;

  if (cached.length > 0 && cached.length === matchSearch.candidates.length) {
    // 缓存命中 (数量一致)
    cacheHit = true;
    for (const c of cached) {
      resultByCandidateId.set(c.candidateId, {
        rank: c.rank,
        total: c.total,
        priceScore: c.priceScore,
        qualityScore: c.qualityScore,
        gateReason: c.gateReason,
      });
    }
  } else {
    // 缓存未命中: 调 matcher rerank
    const raw = matchSearch.rawResponse as {
      candidate_info_list?: RawCandidate[];
    };
    const rawList = raw?.candidate_info_list ?? [];

    // 组装 matcher rerank 请求 body
    const rerankBody = {
      candidates: rawList.map((c) => ({
        item_id: c.item_id ?? "",
        title: c.title ?? "",
        condition: c.condition ?? "",
        price: c.price ?? null,
        compatibility: c.compatibility ?? {},
        candidate_label: c.candidate_label ?? null,
        optimizer_fields: c.optimizer_fields ?? null,
      })),
      preset,
    };

    let rerankRes: Response;
    try {
      rerankRes = await fetch(`${MATCHER_URL}/api/rerank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rerankBody),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          error: "Failed to reach matcher for rerank",
          detail,
          matcherUrl: MATCHER_URL,
        },
        { status: 502 }
      );
    }

    if (!rerankRes.ok) {
      const errText = await rerankRes.text();
      return NextResponse.json(
        {
          error: "Matcher rerank failed",
          status: rerankRes.status,
          detail: errText.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const rerankData = (await rerankRes.json()) as RerankResult;
    const opt = rerankData.optimizer_result;

    // 建 ebayItemId -> optimizer 结果 lookup
    const byItemId = new Map<
      string,
      {
        rank?: number;
        total?: number;
        priceScore?: number;
        qualityScore?: number;
        gateReason?: string;
      }
    >();
    for (const e of opt.eligible) {
      byItemId.set(e.item_id, {
        rank: e.rank,
        total: e.total,
        priceScore: e.price_score,
        qualityScore: e.quality_score,
      });
    }
    for (const r of opt.rejected) {
      byItemId.set(r.item_id, { gateReason: r.reason });
    }

    // 转成 candidateId 索引 + 存缓存
    const cacheRows: Array<{
      candidateId: string;
      matchSearchId: string;
      preset: string;
      rank: number | null;
      total: number | null;
      priceScore: number | null;
      qualityScore: number | null;
      gateReason: string | null;
    }> = [];

    for (const c of matchSearch.candidates) {
      const r = byItemId.get(c.ebayItemId) || {};
      const row = {
        rank: r.rank ?? null,
        total: r.total ?? null,
        priceScore: r.priceScore ?? null,
        qualityScore: r.qualityScore ?? null,
        gateReason: r.gateReason ?? null,
      };
      resultByCandidateId.set(c.id, row);
      cacheRows.push({
        candidateId: c.id,
        matchSearchId,
        preset,
        ...row,
      });
    }

    await prisma.optimizerResult.createMany({
      data: cacheRows,
      skipDuplicates: true,   // 万一并发写入, 避免 unique 冲突
    });
  }

  // 2. 更新 Candidate 5 列作为当前 preset 快照 (逐条 update, 走事务)
  await prisma.$transaction(
    matchSearch.candidates.map((c) => {
      const r = resultByCandidateId.get(c.id) || {
        rank: null,
        total: null,
        priceScore: null,
        qualityScore: null,
        gateReason: null,
      };
      return prisma.candidate.update({
        where: { id: c.id },
        data: {
          optimizerRank: r.rank,
          optimizerTotal: r.total,
          optimizerPriceScore: r.priceScore,
          optimizerQualityScore: r.qualityScore,
          optimizerGateReason: r.gateReason,
        },
      });
    })
  );

  // 3. 更新 PartLine.selectedPreset (记住偏好)
  await prisma.partLine.update({
    where: { id: matchSearch.partLineId },
    data: { selectedPreset: preset },
  });

  // 4. 拿最新 candidates 排序返回
  const updated = await prisma.matchSearch.findUnique({
    where: { id: matchSearchId },
    include: { candidates: { orderBy: { rank: "asc" } } },
  });

  const sorted = [...(updated?.candidates ?? [])].sort((a, b) => {
    const ar = a.optimizerRank;
    const br = b.optimizerRank;
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1;
    if (br != null) return 1;
    return a.rank - b.rank;
  });

  // 从 rawResponse 里补 brand / enrichedFields / compatibility / additionalImages (透传, 不落库)
  const raw = matchSearch.rawResponse as {
    candidate_info_list?: RawCandidate[];
  };
  const rawByItemId = new Map<string, RawCandidate>();
  for (const c of raw?.candidate_info_list ?? []) {
    if (c.item_id) rawByItemId.set(c.item_id, c);
  }

  return NextResponse.json({
    matchSearchId,
    preset,
    cacheHit,
    candidateCount: sorted.length,
    optimizerMeta: {
      preset,
      eligibleCount: sorted.filter((c) => c.optimizerRank != null).length,
      rejectedCount: sorted.filter((c) => c.optimizerGateReason != null).length,
    },
    candidates: sorted.map((c) => {
      const rawC = rawByItemId.get(c.ebayItemId);
      const compat = rawC?.compatibility || {};
      const brand =
        (compat.Brand as string) || (compat.Make as string) || null;
      return {
        id: c.id,
        rank: c.rank,
        title: c.title,
        price: String(c.price),
        currency: c.currency,
        itemUrl: c.itemUrl,
        imageUrl: c.imageUrl,
        condition: c.condition,
        candidateLabel: c.candidateLabel,
        labelSource: c.labelSource,
        ebayItemId: c.ebayItemId,
        optimizerRank: c.optimizerRank,
        optimizerTotal: c.optimizerTotal,
        optimizerPriceScore: c.optimizerPriceScore,
        optimizerQualityScore: c.optimizerQualityScore,
        optimizerGateReason: c.optimizerGateReason,
        brand,
        enrichedFields: rawC?.optimizer_fields ?? null,
        compatibility: (rawC?.compatibility as Record<string, unknown>) ?? null,
        additionalImageUrls: rawC?.additional_image_urls ?? [],
      };
    }),
  });
}