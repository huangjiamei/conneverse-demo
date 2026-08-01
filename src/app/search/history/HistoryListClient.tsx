"use client";

/**
 * Search History 列表 (客户端): 单条删 + 批量选择删。
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

export type HistoryRow = {
  id: string;
  part: string;
  vehicle: string; // "2022 Toyota Camry" (+ submodel)
  category: string | null;
  verifiedCount: number;
  topPick: { title: string; price: string; score: number | null } | null;
  when: string;
};

export default function HistoryListClient({
  rows: initialRows,
}: {
  rows: HistoryRow[];
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
        {/* 列头 (含全选) */}
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all"
            className="w-4 h-4 shrink-0 accent-[#00B4A6] cursor-pointer"
          />
          <div className="flex-1 min-w-0 hidden md:block">
            Part / Vehicle · Category
          </div>
          <div className="w-[110px] shrink-0 hidden md:block">Verified</div>
          <div className="w-[300px] shrink-0 hidden md:block">
            Top pick · Balanced
          </div>
          <div className="w-[150px] shrink-0 hidden md:block text-right">
            When
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

              {/* 主内容 (链到详情) */}
              <Link
                href={`/search/history/${r.id}`}
                className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 py-3 group"
              >
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-medium truncate ${
                      isEmpty ? "text-gray-400" : "text-[#1A1A2E]"
                    }`}
                  >
                    {r.part}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {r.vehicle}
                    {r.category && (
                      <span className="text-gray-400"> · {r.category}</span>
                    )}
                  </div>
                </div>

                {isEmpty ? (
                  <div className="w-full md:w-[410px] shrink-0 text-xs text-gray-400 italic">
                    No verified matches
                  </div>
                ) : (
                  <>
                    <div className="w-[110px] shrink-0">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-700">
                        {r.verifiedCount} verified
                      </span>
                    </div>
                    <div className="w-full md:w-[300px] shrink-0 text-xs min-w-0">
                      {r.topPick ? (
                        <>
                          <div className="text-gray-700 truncate">
                            {r.topPick.title}
                          </div>
                          <div className="text-gray-400 tabular-nums">
                            ${r.topPick.price}
                            {r.topPick.score != null && (
                              <span> · score {r.topPick.score}</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </>
                )}

                <div className="w-full md:w-[150px] shrink-0 md:text-right text-xs text-gray-400 whitespace-nowrap">
                  {r.when}
                </div>

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
