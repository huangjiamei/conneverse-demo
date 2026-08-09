"use client";

/**
 * Admin sub-nav: two tabs only — Users and Shops.
 *
 * Batch 3 removed the standalone Dashboard and "Shop admin requests" tabs; the
 * counts they used to show now ride as badges here, and request review moved
 * into each shop's detail page.
 *
 * "Go to app" is the escape hatch back to /ro. Logout stays in AppHeader above,
 * so it isn't duplicated here.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Store, Users } from "lucide-react";

export function AdminNav({
  pendingUsers,
  pendingRequests,
}: {
  pendingUsers: number;
  pendingRequests: number;
}) {
  const pathname = usePathname() ?? "";

  const tabs = [
    { href: "/admin/users", label: "Users", icon: Users, badge: pendingUsers },
    { href: "/admin/shops", label: "Shops", icon: Store, badge: pendingRequests },
  ];

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="max-w-[1280px] mx-auto px-8 flex items-center justify-between gap-6">
        <div className="flex items-center gap-1 -mb-px">
          {tabs.map((t) => {
            const active =
              pathname === t.href || pathname.startsWith(`${t.href}/`);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`inline-flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium border-b-2 transition ${
                  active
                    ? "border-[#00B4A6] text-[#1A1A2E]"
                    : "border-transparent text-gray-500 hover:text-[#1A1A2E]"
                }`}
              >
                <Icon size={15} />
                {t.label}
                {t.badge > 0 && (
                  <span
                    title={`${t.badge} pending`}
                    className="ml-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full
                               bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700 tabular-nums"
                  >
                    {t.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <Link
          href="/search"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#00B4A6] hover:underline"
        >
          Go to app
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </nav>
  );
}
