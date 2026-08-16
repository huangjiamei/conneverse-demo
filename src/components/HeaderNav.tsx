"use client";

/**
 * Main app header nav, by role. Home is /search (Search) for everyone.
 *
 *   PLATFORM_ADMIN → RO Search + Admin   (RO is platform-only)
 *   SHOP_ADMIN     → My Shop
 *   EMPLOYEE       → the shop name, in the same slot but as plain text —
 *                    they have nothing to manage there, so it labels rather
 *                    than navigates.
 *
 * Profile and Logout live in AppHeader so all three roles get them in one place.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutGrid, Package, Search, Store } from "lucide-react";
import type { Role } from "@/lib/auth/types";

const linkClass =
  "inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-[#00B4A6] transition";

export function HeaderNav({
  role,
  shopName,
}: {
  role: Role;
  /** null for the platform admin — they don't belong to a shop */
  shopName: string | null;
}) {
  const pathname = usePathname() ?? "";

  const inAdmin = pathname.startsWith("/admin");
  const inRo = pathname === "/ro" || pathname.startsWith("/ro/");
  const inSearch = pathname.startsWith("/search");

  if (role === "PLATFORM_ADMIN") {
    // 后台里不重复给入口 —— AdminNav 上已经有 "Go to app"
    if (inAdmin) return null;
    // 两个入口各自独立判断,不是二选一的切换:/profile 这类中性页面
    // 既不在 /search 也不在 /ro,两个都得给,否则会少一条出路。
    return (
      <>
        {!inSearch && (
          <Link href="/search" className={linkClass}>
            <Search size={15} />
            Search
          </Link>
        )}
        {!inRo && (
          <Link href="/ro" className={linkClass}>
            <ClipboardList size={15} />
            RO Search
          </Link>
        )}
        <Link href="/admin/users" className={linkClass}>
          <LayoutGrid size={15} />
          Admin
        </Link>
      </>
    );
  }

  // 门店用户: 没有 RO 入口,/search 就是他们的主页
  return (
    <>
      {role === "SHOP_ADMIN"
        ? !pathname.startsWith("/shop") && (
            <Link href="/shop" className={linkClass}>
              <Store size={15} />
              My Shop
            </Link>
          )
        : shopName && (
            // 员工在同一个位置只看店名,不是链接 —— 那边没有他能操作的东西
            <span
              title="Your shop"
              className="inline-flex items-center gap-1.5 text-sm text-white/70"
            >
              <Store size={15} className="text-white/40" />
              {shopName}
            </span>
          )}
      {!inSearch && (
        <Link href="/search" className={linkClass}>
          <Search size={15} />
          Search
        </Link>
      )}
      {/* 订单入口两个门店角色都给 —— 可见范围在 /orders 里按角色收窄
          (店铺管理员看本店, 员工只看自己),所以链接本身不必分角色 */}
      {!pathname.startsWith("/orders") && (
        <Link href="/orders" className={linkClass}>
          <Package size={15} />
          Orders
        </Link>
      )}
    </>
  );
}
