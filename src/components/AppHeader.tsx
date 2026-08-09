/**
 * Sticky navy app header.
 *
 * 视觉:深色 navy 底 + teal 副标题, sticky top-0。
 *
 * 会话由 layout (server component) 读好传进来:
 *   未登录 → 只剩品牌字样,logo 不可点 (登录页本身就是 /,没必要跳)
 *   已登录 → 右上角是搜索入口互跳 + 用户身份 + 退出
 * 平台管理员没有零件搜索流程,只给他 /admin 一个入口。
 */

import Link from "next/link";
import type { LiveSession } from "@/lib/auth/liveSession";
import { HeaderNav } from "./HeaderNav";
import { LogoutButton } from "./LogoutButton";

/** "Alex Rivera" → AR · 没名字就用邮箱首字母 */
function initials(name: string | null, email: string): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]!.toUpperCase()).join("");
  }
  return email[0]?.toUpperCase() ?? "?";
}

export function AppHeader({ session }: { session: LiveSession | null }) {
  // 三种角色的应用主页都是 Search
  const home = session ? "/search" : null;

  const brand = (
    <>
      <span className="text-lg sm:text-xl font-bold tracking-tight group-hover:text-[#00B4A6] transition">
        Conneverse
      </span>
      <span className="block text-[12px] text-[#00B4A6] -mt-0.5 tracking-wide">
        Trusted Parts Agent
      </span>
    </>
  );

  return (
    <header className="sticky top-0 z-50 bg-[#1B2838] text-white shadow-lg">
      {/* px-8 与各 page 的 p-8 对齐,logo 和内容左边缘同一条线 */}
      <div className="max-w-[1440px] mx-auto px-8 h-14 flex items-center justify-between">
        {home ? (
          <Link href={home} className="group">
            {brand}
          </Link>
        ) : (
          <div className="group">{brand}</div>
        )}

        {session && (
          <div className="flex items-center gap-4">
            <HeaderNav role={session.role} shopName={session.shopName} />

            {/* 身份块本身就是 Profile 入口 —— 三种角色都有 */}
            <Link
              href="/profile"
              title="Profile"
              className="flex items-center gap-2 rounded-lg px-2 py-1 -mx-1 hover:bg-white/10 transition"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00B4A6] text-[11px] font-bold text-[#0d1b26]">
                {initials(session.name, session.email)}
              </span>
              {/* 只显示用户名 —— 角色在 /profile 里有,不需要一直挂在头上 */}
              <span className="hidden sm:block text-[13px] text-white/90">
                {session.name ?? session.email}
              </span>
            </Link>

            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}
