/**
 * /results/[id] — user-side (customer) result view for one MatchSearch.
 *
 * Same data as the admin detail page (/search/history/[id]) — reuses the stored
 * OptimizerResult rankings (Budget / Rush / Balanced), no new backend compute.
 * Renders the simplified ≤5 merged view (UserResults) instead of the full table.
 *
 * payload 组装、可见范围、按角色裁字段全在 lib/userResultsData —— 这页曾经自己
 * 抄了一份几乎一样的组装代码,两份就是两个供应商泄露面,现在只留一份。
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import UserResults from "./UserResults";
import { requireLiveSession } from "@/lib/auth/liveSession";
import { loadUserResults } from "@/lib/userResultsData";

export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 权威会话:登录后被停用/降级的账号立刻失效,不等 token 过期
  const session = await requireLiveSession();
  const isPlatformAdmin = session.role === "PLATFORM_ADMIN";

  const { id } = await params;

  // 可见范围校验在 loadUserResults 里 —— 列表过滤了不够, 直接开别人的 id 也要挡住
  const payload = await loadUserResults(id, session);
  if (!payload) notFound();

  const { context, ordering, heroes, alternates } = payload;
  const hasResults = heroes.length > 0;

  const when = new Date(context.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // 布局与 admin view 对齐: 快照头 + 全宽结果
  return (
    <main className="w-full max-w-[1280px] mx-auto p-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/search/history"
          className="text-sm text-gray-500 hover:text-gray-700 transition inline-flex items-center gap-1"
        >
          <ChevronLeft size={15} />
          Back to history
        </Link>
        {/* Admin view = 带 optimizer 分数 / gate 原因的内部表格,只给平台管理员 */}
        {isPlatformAdmin && (
          <Link
            href={`/search/history/${id}`}
            className="text-xs text-gray-400 hover:text-[#00B4A6] transition"
          >
            Admin view →
          </Link>
        )}
      </div>

      {/* 搜索快照头 (同 admin) */}
      <div className="mt-4 bg-[#1A1A2E] text-white rounded-xl p-6">
        <div className="text-xs text-white/50 tracking-wide">Searched for</div>
        <div className="mt-1 text-xl font-semibold">
          {[context.part, context.partNumber].filter(Boolean).join(" · ") || "—"}
        </div>
        <div className="mt-1 text-sm text-white/70">
          {context.vehicle}
          {context.category ? ` · ${context.category}` : ""}
        </div>
        <div className="mt-2 text-xs text-white/40">{when}</div>
      </div>

      {/* 结果全宽 —— 图片密集的对比卡片需要横向空间,不再左右分栏 */}
      <div className="mt-6">
        {hasResults ? (
          <UserResults
            context={context}
            ordering={ordering}
            heroes={heroes}
            alternates={alternates}
          />
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
            No verified matches for this search. Try adjusting the description
            or part number.
          </div>
        )}
      </div>
    </main>
  );
}
