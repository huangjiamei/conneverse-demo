"use client";

/**
 * 退出。POST /api/auth/logout 清 cookie 后回登录页。
 * router.refresh() 让 layout 重新读会话,头部立刻恢复未登录形态。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title="Sign out"
      aria-label="Sign out"
      className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-[#00B4A6]
                 disabled:opacity-50 transition"
    >
      <LogOut size={15} />
      <span className="hidden sm:inline">{pending ? "…" : "Sign out"}</span>
    </button>
  );
}
