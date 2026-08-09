"use client";

/**
 * Delete a shop. The server refuses while members or repair orders still point
 * at it (both FKs are RESTRICT) and returns a readable 409 — surfaced here
 * instead of letting a foreign-key error reach the user.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

export function DeleteShopButton({
  shopId,
  shopName,
  blocked,
}: {
  shopId: string;
  shopName: string;
  /** Non-null when we already know it can't be deleted — explains why. */
  blocked: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (
      !window.confirm(
        `Delete ${shopName}? This cannot be undone. Any admin requests for it are removed too.`
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/shops/${shopId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.replace("/admin/shops");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || blocked !== null}
        title={blocked ?? undefined}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2
                   text-[13px] font-semibold text-red-600 hover:bg-red-50 hover:border-red-300
                   disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {pending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Trash2 size={14} />
        )}
        Delete shop
      </button>
      {(blocked || error) && (
        <p
          role={error ? "alert" : undefined}
          className={`max-w-md text-[12px] ${error ? "text-red-600" : "text-gray-500"}`}
        >
          {error ?? blocked}
        </p>
      )}
    </div>
  );
}
