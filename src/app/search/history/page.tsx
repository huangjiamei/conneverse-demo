/**
 * /search/history — 全局搜索历史。
 *
 * 倒序列出所有 MatchSearch。每行: 零件名 / 车型·类目 / 时间 / verified 候选数 /
 * Top pick(默认 Balanced preset 的 rank1: 名字·价格·分)。整行链到详情页。
 *
 * verified 数 + Top pick 全部从已落库的 Candidate / OptimizerResult 读, 不重打 eBay。
 * 0 verified 的行灰化, 显示 "No verified matches"。
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import HistoryListClient, { type HistoryRow } from "./HistoryListClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Search history — Conneverse",
};

// Top pick 取哪个 preset 的 rank1 —— 与前端默认排序一致
const HISTORY_PRESET = "Balanced";

function formatWhen(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SearchHistoryPage() {
  // 1) 全局搜索, 倒序
  const searches = await prisma.matchSearch.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      queryVehicleYear: true,
      queryVehicleMake: true,
      queryVehicleModel: true,
      queryVehicleSubModel: true,
      queryPartDescription: true,
      queryPcdbCategoryId: true,
    },
  });
  const ids = searches.map((s) => s.id);

  // 2) verified 候选数 (candidateLabel === 1), 一次 groupBy
  const vcounts = ids.length
    ? await prisma.candidate.groupBy({
        by: ["matchSearchId"],
        where: { matchSearchId: { in: ids }, candidateLabel: 1 },
        _count: true,
      })
    : [];
  const verifiedByMs = new Map(vcounts.map((v) => [v.matchSearchId, v._count]));

  // 3) Balanced 的 rank1 = Top pick, 一次 findMany (带 candidate 名字/价格)
  const topPicks = ids.length
    ? await prisma.optimizerResult.findMany({
        where: { matchSearchId: { in: ids }, preset: HISTORY_PRESET, rank: 1 },
        select: {
          matchSearchId: true,
          total: true,
          candidate: { select: { title: true, price: true } },
        },
      })
    : [];
  const topByMs = new Map(topPicks.map((t) => [t.matchSearchId, t]));

  // 4) 类目名 (queryPcdbCategoryId → PcdbCategory.name), 一次批量查
  const catIds = [
    ...new Set(
      searches
        .map((s) => s.queryPcdbCategoryId)
        .filter((x): x is number => x != null)
    ),
  ];
  const cats = catIds.length
    ? await prisma.pcdbCategory.findMany({
        where: { id: { in: catIds } },
        select: { id: true, name: true },
      })
    : [];
  const catNameById = new Map(cats.map((c) => [c.id, c.name]));

  // 组装成客户端友好的行数据 (选择 / 删除交互在 HistoryListClient 里)
  const rows: HistoryRow[] = searches.map((s) => {
    const top = topByMs.get(s.id);
    const sub = s.queryVehicleSubModel ? ` ${s.queryVehicleSubModel}` : "";
    return {
      id: s.id,
      part: s.queryPartDescription,
      vehicle: `${s.queryVehicleYear} ${s.queryVehicleMake} ${s.queryVehicleModel}${sub}`,
      category:
        s.queryPcdbCategoryId != null
          ? catNameById.get(s.queryPcdbCategoryId) ?? null
          : null,
      verifiedCount: verifiedByMs.get(s.id) ?? 0,
      topPick: top
        ? {
            title: top.candidate.title,
            price: Number(top.candidate.price).toFixed(2),
            score: top.total != null ? Math.round(top.total) : null,
          }
        : null,
      when: formatWhen(s.createdAt),
    };
  });

  return (
    <main className="w-full max-w-[1280px] mx-auto p-6">
      {/* 顶部: 标题 + New Search */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <h1 className="text-xl font-semibold text-[#1A1A2E]">Search history</h1>
        <Link
          href="/search"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00A396] transition"
        >
          <Plus size={15} />
          New search
        </Link>
      </div>

      <HistoryListClient rows={rows} />
    </main>
  );
}
