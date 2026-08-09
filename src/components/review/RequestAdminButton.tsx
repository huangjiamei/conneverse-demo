"use client";

/**
 * POST /api/shop-admin-requests —— kind 由服务端定,这里不传。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldPlus } from "lucide-react";

export function RequestAdminButton({
  label,
  variant,
  confirm,
}: {
  label: string;
  variant: "solid" | "link";
  /** 非 null 时先弹确认 (REPLACE 会顶掉现任管理员) */
  confirm: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (confirm && !window.confirm(confirm)) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/shop-admin-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const cls =
    variant === "solid"
      ? "inline-flex items-center gap-1.5 shrink-0 px-3.5 py-1.5 rounded-lg bg-[#00B4A6] text-white text-[12px] font-semibold hover:bg-[#00A396] disabled:opacity-50 transition"
      : "inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-[#00B4A6] disabled:opacity-50 transition";

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={onClick} disabled={pending} className={cls}>
        {pending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <ShieldPlus size={13} />
        )}
        {label}
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
