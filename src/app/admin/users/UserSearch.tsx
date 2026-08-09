"use client";

/**
 * Name/email search box. Writes to the URL (?q=) so the filter is shareable and
 * survives the refresh that follows a review action; the other active filters
 * are carried through unchanged.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

export function UserSearch({
  initial,
  shop,
  status,
}: {
  initial: string;
  shop?: string;
  status?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function submit(q: string) {
    const p = new URLSearchParams();
    if (shop) p.set("shop", shop);
    if (status) p.set("status", status);
    if (q.trim()) p.set("q", q.trim());
    const s = p.toString();
    router.push(s ? `/admin/users?${s}` : "/admin/users");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="relative max-w-sm"
    >
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search name or email…"
        aria-label="Search users by name or email"
        className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-9 text-sm text-[#1A1A2E]
                   placeholder:text-gray-400 focus:border-[#00B4A6] focus:outline-none
                   focus:ring-2 focus:ring-[#00B4A6]/25 transition"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            submit("");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={15} />
        </button>
      )}
    </form>
  );
}
