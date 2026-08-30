"use client";

/**
 * Search History 列表 (客户端): 单条删 + 批量选择删。
 *
 * 列按角色分两套 (由 page 传 isPlatformAdmin 决定, 数据也是按角色查好才发下来的):
 *   平台管理员 → Verified · Top pick (Balanced, 带分数)
 *   其余角色   → Cheapest (Budget) · Fastest (Rush, 带时效)
 *
 * - 每行左侧复选框, 右侧垃圾桶。
 * - 勾选若干 → 顶部出现 "删除选中 (N)" 按钮。
 * - 顶部一个全选复选框。
 * - 不做"清空全部"。
 * - 删除走 DELETE /api/search/history (事务, FK 安全), 成功后本地移除。
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Trash2, Plus, Search as SearchIcon } from "lucide-react";

/** 一个 pick 格子; 缺这个 preset 的 rank-1 时整体为 null → 显示 "—" */
export type PickCell = {
  label: string;
  price: string;
  priceNote: string | null;
  delivery: string | null;
  score: number | null;
};

export type HistoryRow = {
  id: string;
  part: string;
  partNumber: string | null; // 按零件号搜时描述为空, 用它兜底显示
  vehicle: string; // "2022 Toyota Camry" (+ submodel)
  category: string | null;
  verifiedCount: number;
  balanced: PickCell | null; // 平台管理员
  cheapest: PickCell | null; // 非平台管理员
  fastest: PickCell | null; // 非平台管理员
};

/**
 * 列宽 —— 表头和行共用同一组 class,改一处两边同步。
 * Part/Vehicle 和 Verified 固定窄宽 (原来 Part/Vehicle 是 flex-1 会吃掉所有
 * 空间, Verified 的 110px 也远超一个数字的需要), 省下的横向空间全给 pick 列。
 */
const COL = {
  part: "md:w-[248px]",
  // 去掉 When 列后腾出的空间给它, 表头 "Verified" 才不会被压得换行
  verified: "md:w-[84px]",
  pick: "w-full md:flex-1 md:min-w-0",
} as const;

export default function HistoryListClient({
  rows: initialRows,
  isPlatformAdmin,
}: {
  rows: HistoryRow[];
  isPlatformAdmin: boolean;
}) {
  const [rows, setRows] = useState<HistoryRow[]>(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))
    );
  }

  async function deleteIds(ids: string[]) {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/search/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        alert("Delete failed. Please try again.");
        return;
      }
      const idSet = new Set(ids);
      setRows((prev) => prev.filter((r) => !idSet.has(r.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } catch {
      alert("Delete failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function deleteOne(id: string) {
    if (window.confirm("Delete this search? This can't be undone."))
      deleteIds([id]);
  }

  function deleteSelected() {
    if (
      window.confirm(
        `Delete ${selected.size} selected search${
          selected.size === 1 ? "" : "es"
        }? This can't be undone.`
      )
    )
      deleteIds([...selected]);
  }

  if (rows.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-10 text-center">
        <SearchIcon size={28} className="mx-auto text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">No searches.</p>
        <Link
          href="/search"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#00B4A6] hover:underline"
        >
          <Plus size={14} />
          Start a search
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* 工具条: 计数 / 删除选中 */}
      <div className="flex items-center justify-between gap-4 mb-3 min-h-[32px]">
        <p className="text-sm text-gray-500">
          {someSelected
            ? `${selected.size} selected`
            : `${rows.length} search${rows.length === 1 ? "" : "es"} · newest first`}
        </p>
        {someSelected && (
          <button
            type="button"
            onClick={deleteSelected}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
          >
            <Trash2 size={14} />
            Delete selected ({selected.size})
          </button>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
        {/* 列头 (含全选)。宽度和下面的行一一对应,内层 gap 也保持 gap-4,
            否则表头会和内容错位。Part/Vehicle 与 Verified 给固定窄宽,
            剩余空间全部让给 pick 列 —— 那几列的内容最长。 */}
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all"
            className="w-4 h-4 shrink-0 accent-[#00B4A6] cursor-pointer"
          />
          <div className="flex-1 min-w-0 hidden md:flex md:items-center md:gap-4">
            <div className={`${COL.part} shrink-0`}>Part / Vehicle</div>
            {isPlatformAdmin && (
              <>
                <div
                  className={`${COL.verified} shrink-0 text-center whitespace-nowrap`}
                >
                  Verified
                </div>
                <div className={COL.pick}>Top pick · Balanced</div>
              </>
            )}
            <div className={COL.pick}>Cheapest</div>
            <div className={COL.pick}>Fastest</div>
            <div className="w-4 shrink-0" />
          </div>
          <div className="w-8 shrink-0" />
        </div>

        {rows.map((r) => {
          const isEmpty = r.verifiedCount === 0;
          const isChecked = selected.has(r.id);
          return (
            <div
              key={r.id}
              className={`flex items-center gap-3 px-4 transition ${
                isChecked ? "bg-teal-50/40" : "hover:bg-gray-50"
              }`}
            >
              {/* 复选框 */}
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleOne(r.id)}
                aria-label={`Select ${r.part}`}
                className="w-4 h-4 shrink-0 accent-[#00B4A6] cursor-pointer"
              />

              {/* 主内容 (默认进 customer view; admin 表可从那里 "Admin view →" 进) */}
              <Link
                href={`/results/${r.id}`}
                className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 py-3 group"
              >
                <div className={`w-full ${COL.part} md:shrink-0 min-w-0`}>
                  <div
                    className={`font-medium truncate ${
                      isEmpty ? "text-gray-400" : "text-[#1A1A2E]"
                    }`}
                  >
                    {[r.part, r.partNumber].filter(Boolean).join(" · ")}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {r.vehicle}
                    {r.category && (
                      <span className="text-gray-400"> · {r.category}</span>
                    )}
                  </div>
                </div>

                {isPlatformAdmin && (
                  <div className={`${COL.verified} shrink-0 md:text-center`}>
                    <span
                      title={`${r.verifiedCount} verified candidate${r.verifiedCount === 1 ? "" : "s"}`}
                      className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                        isEmpty
                          ? "bg-gray-100 text-gray-400"
                          : "bg-teal-50 text-teal-700"
                      }`}
                    >
                      {r.verifiedCount}
                    </span>
                  </div>
                )}

                {isEmpty ? (
                  // 0 verified: pick 列没东西可放, 合并成一句说明
                  <div className="flex-1 min-w-0 text-xs text-gray-400 italic">
                    No verified matches
                  </div>
                ) : (
                  <>
                    {isPlatformAdmin && (
                      <div className={COL.pick}>
                        <Pick cell={r.balanced} />
                      </div>
                    )}
                    <div className={COL.pick}>
                      <Pick cell={r.cheapest} />
                    </div>
                    <div className={COL.pick}>
                      <Pick cell={r.fastest} />
                    </div>
                  </>
                )}


                <ChevronRight
                  size={16}
                  className="hidden md:block shrink-0 text-gray-300 group-hover:text-[#00B4A6] transition"
                />
              </Link>

              {/* 垃圾桶 (单条删) */}
              <button
                type="button"
                onClick={() => deleteOne(r.id)}
                disabled={busy}
                aria-label={`Delete ${r.part}`}
                title="Delete this search"
                className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * 一个 pick 格子。老数据缺这个 preset 的 rank-1 时 cell 是 null → "—"。
 * score 只有平台管理员那一路会有值 (服务端就没发给其他角色)。
 */
function Pick({ cell }: { cell: PickCell | null }) {
  if (!cell) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="text-xs min-w-0">
      <div className="line-clamp-2 break-words text-gray-700">{cell.label}</div>
      <div className="tabular-nums text-gray-400">
        {cell.price}
        {cell.priceNote && (
          <span className="text-amber-600"> {cell.priceNote}</span>
        )}
        {cell.delivery && <span> · {cell.delivery}</span>}
        {cell.score != null && <span> · score {cell.score}</span>}
      </div>
    </div>
  );
}
