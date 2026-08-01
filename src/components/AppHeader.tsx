/**
 * Sticky navy app header.
 *
 * 借鉴 main 分支的视觉设计:
 *   - 深色 navy 底 + teal 副标题
 *   - sticky top-0
 *
 * 右上角入口按当前路径切换 (两个搜索流程互跳):
 *   - 在 /search* (车辆搜索) → "RO Search" 跳老主页 /
 *   - 其它页 (主页 / RO 页) → "New search" 跳 /search
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppHeader() {
  const pathname = usePathname();
  const onVehicleSearch = pathname?.startsWith("/search") ?? false;
  const nav = onVehicleSearch
    ? { href: "/", label: "RO Search →" }
    : { href: "/search", label: "New search →" };

  return (
    <header className="sticky top-0 z-50 bg-[#1B2838] text-white shadow-lg">
      {/* px-8 与各 page 的 p-8 对齐,logo 和内容左边缘同一条线 */}
      <div className="max-w-[1440px] mx-auto px-8 h-14 flex items-center justify-between">
        <Link href="/" className="group">
          <span className="text-lg sm:text-xl font-bold tracking-tight group-hover:text-[#00B4A6] transition">
            Conneverse
          </span>
          <span className="block text-[12px] text-[#00B4A6] -mt-0.5 tracking-wide">
            Trusted Parts Agent
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href={nav.href}
            className="text-sm text-white/80 hover:text-[#00B4A6] transition"
          >
            {nav.label}
          </Link>
        </div>
      </div>
    </header>
  );
}