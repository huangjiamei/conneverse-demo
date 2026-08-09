"use client";

/**
 * Approve / Reject 一对按钮 —— 三个审核列表 (shop-admin requests / admin users /
 * team) 共用。
 *
 * 服务端可能回 409 "已被处理" (别人刚审过或竞态输了): 这种情况把错误显示出来
 * 并 refresh(),让列表回到真实状态,而不是让用户对着过期数据反复点。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

export function ReviewActions({
  endpoint,
  approveLabel = "Approve",
  rejectLabel = "Reject",
  confirmApprove,
}: {
  /** POST 目标,body 固定为 { action } */
  endpoint: string;
  approveLabel?: string;
  rejectLabel?: string;
  /** 有值时点 Approve 先弹确认 (用于 REPLACE 这种会顶掉现任管理员的动作) */
  confirmApprove?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "reject") {
    if (action === "approve" && confirmApprove && !window.confirm(confirmApprove)) {
      return;
    }
    setPending(action);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        // 状态已经变了 —— 拉一次最新列表
        if (res.status === 409) router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => run("approve")}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00B4A6] text-white
                     text-[12px] font-semibold hover:bg-[#00A396] disabled:opacity-50
                     disabled:cursor-not-allowed transition"
        >
          {pending === "approve" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          {approveLabel}
        </button>
        <button
          type="button"
          onClick={() => run("reject")}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300
                     text-gray-600 text-[12px] font-semibold hover:bg-gray-50 hover:border-gray-400
                     disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {pending === "reject" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <X size={13} />
          )}
          {rejectLabel}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-red-600 max-w-[260px] text-right">
          {error}
        </p>
      )}
    </div>
  );
}
