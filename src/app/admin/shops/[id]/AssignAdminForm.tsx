"use client";

/**
 * Pick an approved member and make them the shop admin.
 *
 * Convenience wrapper over POST /api/shops/[id]/admin, which runs the same
 * transaction as an approved REPLACE — so the previous admin is demoted the
 * same way and any pending requests are superseded.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCog } from "lucide-react";

export type AssignableMember = {
  id: string;
  name: string | null;
  email: string;
};

export function AssignAdminForm({
  shopId,
  shopName,
  members,
  currentAdminLabel,
}: {
  shopId: string;
  shopName: string;
  members: AssignableMember[];
  currentAdminLabel: string | null;
}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (members.length === 0) {
    return (
      <p className="text-[13px] text-gray-500">
        No approved members yet — approve someone first, then you can make them
        admin.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    const picked = members.find((m) => m.id === userId);
    const who = picked?.name ?? picked?.email ?? "this member";
    const msg = currentAdminLabel
      ? `Make ${who} the admin of ${shopName}? ${currentAdminLabel} becomes a regular employee.`
      : `Make ${who} the admin of ${shopName}?`;
    if (!window.confirm(msg)) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/shops/${shopId}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        if (res.status === 409) router.refresh();
        return;
      }
      setUserId("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        aria-label="Choose a member to make admin"
        className="min-w-[240px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#1A1A2E]
                   focus:border-[#00B4A6] focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/25"
      >
        <option value="">
          {currentAdminLabel ? "Replace admin with…" : "Assign an admin…"}
        </option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name ? `${m.name} — ${m.email}` : m.email}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={!userId || pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#00B4A6] px-3 py-2
                   text-[13px] font-semibold text-[#00B4A6] hover:bg-teal-50
                   disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {pending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <UserCog size={14} />
        )}
        {currentAdminLabel ? "Replace admin" : "Make admin"}
      </button>

      {error && (
        <p role="alert" className="w-full text-[12px] text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
