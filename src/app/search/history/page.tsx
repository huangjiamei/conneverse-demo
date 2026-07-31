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
import { ChevronRight, Plus, Search as SearchIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";

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

  return (
    <main className="w-full max-w-[1280px] mx-auto p-6">
      {/* 顶部: 标题 + New Search */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A2E]">Search history</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {searches.length} search{searches.length === 1 ? "" : "es"} · newest
            first
          </p>
        </div>
        <Link
          href="/search"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00A396] transition"
        >
          <Plus size={15} />
          New search
        </Link>
      </div>

      {searches.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-10 text-center">
          <SearchIcon size={28} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No searches yet.</p>
          <Link
            href="/search"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#00B4A6] hover:underline"
          >
            <Plus size={14} />
            Start your first search
          </Link>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
          {/* 列头 (>=md) */}
          <div className="hidden md:flex items-center gap-4 px-4 py-2 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 font-medium">
            <div className="flex-1 min-w-0">Part / Vehicle · Category</div>
            <div className="w-[110px] shrink-0">Verified</div>
            <div className="w-[300px] shrink-0">Top pick · Balanced</div>
            <div className="w-[150px] shrink-0 text-right">When</div>
            <div className="w-4 shrink-0" />
          </div>

          {searches.map((s) => {
            const vcount = verifiedByMs.get(s.id) ?? 0;
            const top = topByMs.get(s.id);
            const isEmpty = vcount === 0;
            const cat =
              s.queryPcdbCategoryId != null
                ? catNameById.get(s.queryPcdbCategoryId)
                : null;
            const vehicle = `${s.queryVehicleYear} ${s.queryVehicleMake} ${s.queryVehicleModel}`;
            const sub = s.queryVehicleSubModel ? ` ${s.queryVehicleSubModel}` : "";

            return (
              <Link
                key={s.id}
                href={`/search/history/${s.id}`}
                className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-4 py-3 hover:bg-gray-50 transition group"
              >
                {/* 零件名 + 车型·类目 */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-medium truncate ${
                      isEmpty ? "text-gray-400" : "text-[#1A1A2E]"
                    }`}
                  >
                    {s.queryPartDescription}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {vehicle}
                    {sub}
                    {cat && <span className="text-gray-400"> · {cat}</span>}
                  </div>
                </div>

                {isEmpty ? (
                  // 0 verified: 灰化, 占据 verified + top pick 两列
                  <div className="w-full md:w-[410px] shrink-0 text-xs text-gray-400 italic">
                    No verified matches
                  </div>
                ) : (
                  <>
                    {/* verified 数 */}
                    <div className="w-[110px] shrink-0">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-700">
                        {vcount} verified
                      </span>
                    </div>

                    {/* Top pick: 名字 · 价格 · 分 */}
                    <div className="w-full md:w-[300px] shrink-0 text-xs min-w-0">
                      {top ? (
                        <>
                          <div className="text-gray-700 truncate">
                            {top.candidate.title}
                          </div>
                          <div className="text-gray-400 tabular-nums">
                            ${Number(top.candidate.price).toFixed(2)}
                            {top.total != null && (
                              <span> · score {top.total.toFixed(0)}</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </>
                )}

                {/* 时间 */}
                <div className="w-full md:w-[150px] shrink-0 md:text-right text-xs text-gray-400 whitespace-nowrap">
                  {formatWhen(s.createdAt)}
                </div>

                <ChevronRight
                  size={16}
                  className="hidden md:block w-4 shrink-0 text-gray-300 group-hover:text-[#00B4A6] transition"
                />
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
