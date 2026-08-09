/**
 * /search/history — 全局搜索历史。列按角色分两套。
 *
 *   PLATFORM_ADMIN → Part / Vehicle · Verified · Top pick (Balanced) · Cheapest · Fastest · 删除
 *   其余角色        → Part / Vehicle · Cheapest · Fastest · 删除
 *
 * 列表本身按 createdAt 倒序 (工具条上写着 "newest first"), 但不再单列时间。
 *
 * 两套都只读已落库的数据: verified 数来自 Candidate.candidateLabel,
 * 三个 pick 来自 OptimizerResult 里 rank=1 的行 (每次搜索都会写全 4 个 preset),
 * brand / 运费 / 时效来自 MatchSearch.rawResponse。不重打 eBay, 不改 schema。
 *
 * optimizer 总分只发给平台管理员 —— 普通用户界面不出现数值化质量分。
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import HistoryListClient, { type HistoryRow } from "./HistoryListClient";
import { requireLiveSession } from "@/lib/auth/liveSession";
import { loadPresetPicks } from "@/lib/historyPicks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Search history — Conneverse",
};

export default async function SearchHistoryPage() {
  // 权威会话:登录后被停用/降级的账号立刻失效,不等 token 过期
  const session = await requireLiveSession();
  const isPlatformAdmin = session.role === "PLATFORM_ADMIN";

  // 1) 全局搜索, 倒序
  const searches = await prisma.matchSearch.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
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

  // 3) rank-1 的 pick。Cheapest / Fastest 两列所有角色都看得到;
  //    Balanced (带 optimizer 分数) 只查给平台管理员 —— §7: 数值分不进普通用户界面。
  const [balanced, cheapest, fastest] = await Promise.all([
    isPlatformAdmin
      ? loadPresetPicks(ids, "Balanced", { withScore: true })
      : Promise.resolve(null),
    loadPresetPicks(ids, "Budget"),
    loadPresetPicks(ids, "Rush", { withDelivery: true }),
  ]);

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
    const sub = s.queryVehicleSubModel ? ` ${s.queryVehicleSubModel}` : "";
    return {
      id: s.id,
      part: s.queryPartDescription,
      vehicle: `${s.queryVehicleYear} ${s.queryVehicleMake} ${s.queryVehicleModel}${sub}`,
      category:
        s.queryPcdbCategoryId != null
          ? (catNameById.get(s.queryPcdbCategoryId) ?? null)
          : null,
      verifiedCount: verifiedByMs.get(s.id) ?? 0,
      // balanced 只有平台管理员那一路有值 (含分数)
      balanced: balanced?.get(s.id) ?? null,
      cheapest: cheapest.get(s.id) ?? null,
      fastest: fastest.get(s.id) ?? null,
    };
  });

  return (
    <main className="w-full max-w-[1280px] mx-auto p-6">
      {/* 顶部: 标题 + Search */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <h1 className="text-xl font-semibold text-[#1A1A2E]">Search history</h1>
        <Link
          href="/search"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00A396] transition"
        >
          <Plus size={15} />
          Search
        </Link>
      </div>

      <HistoryListClient rows={rows} isPlatformAdmin={isPlatformAdmin} />
    </main>
  );
}
