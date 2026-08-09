/**
 * /admin/users —— every user across every shop, with the platform-admin
 * override to approve or reject any registration (§3a).
 *
 * This is the fallback path that matters when a shop has no admin of its own:
 * nobody else can review those members.
 *
 * Filters are URL state (?shop=&status=&q=) so a filtered view is linkable and
 * survives the router.refresh() that follows each review action.
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma, UserStatus } from "@prisma/client";
import { ReviewActions } from "@/components/review/ReviewActions";
import {
  EmptyState,
  PageHeader,
  ReviewRow,
  StatusBadge,
  formatWhen,
} from "@/components/review/shell";
import { UserSearch } from "./UserSearch";

export const dynamic = "force-dynamic";

const STATUSES: UserStatus[] = ["PENDING", "APPROVED", "REJECTED", "DISABLED"];

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const shopFilter = one(sp.shop);
  const rawStatus = one(sp.status);
  const statusFilter = STATUSES.includes(rawStatus as UserStatus)
    ? (rawStatus as UserStatus)
    : undefined;
  const q = one(sp.q);

  const where: Prisma.UserWhereInput = {
    ...(shopFilter ? { shopId: shopFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, shops, pendingTotal] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: {
        shop: { select: { id: true, name: true, adminUserId: true } },
        approvedByAdmin: { select: { email: true } },
        approvedByUser: { select: { email: true } },
      },
    }),
    prisma.shop.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { members: true } } },
    }),
    prisma.user.count({ where: { status: "PENDING" } }),
  ]);

  // 保留其它过滤条件,只改一个维度
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const shop = "shop" in next ? next.shop : shopFilter;
    const status = "status" in next ? next.status : statusFilter;
    const query = "q" in next ? next.q : q;
    if (shop) p.set("shop", shop);
    if (status) p.set("status", status);
    if (query) p.set("q", query);
    const s = p.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };

  return (
    <main className="w-full max-w-[1280px] mx-auto p-8">
      <PageHeader
        title="Users"
        subtitle={
          pendingTotal > 0
            ? `${pendingTotal} registration${pendingTotal === 1 ? "" : "s"} awaiting approval across all shops.`
            : "Every member of every shop."
        }
      />

      <div className="mb-5 space-y-3">
        <UserSearch initial={q ?? ""} shop={shopFilter} status={statusFilter} />

        <FilterRow label="Status">
          <Chip href={href({ status: undefined })} active={!statusFilter}>
            Any
          </Chip>
          {STATUSES.map((s) => (
            <Chip
              key={s}
              href={href({ status: s })}
              active={statusFilter === s}
            >
              {s.toLowerCase()}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="Shop">
          <Chip href={href({ shop: undefined })} active={!shopFilter}>
            All shops
          </Chip>
          {shops.map((s) => (
            <Chip key={s.id} href={href({ shop: s.id })} active={shopFilter === s.id}>
              {s.name}
              <span className="ml-1 text-gray-400">{s._count.members}</span>
            </Chip>
          ))}
        </FilterRow>
      </div>

      {users.length === 0 ? (
        <EmptyState>No users match these filters.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {users.map((u) => {
            const isShopAdmin = u.shop.adminUserId === u.id;
            const reviewer =
              u.approvedByAdmin?.email ?? u.approvedByUser?.email ?? null;
            return (
              <ReviewRow key={u.id}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[#1A1A2E]">
                      {u.name ?? "—"}
                    </span>
                    <span className="text-sm text-gray-500">{u.email}</span>
                    <StatusBadge status={u.status} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      {isShopAdmin ? "Shop admin" : "Employee"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    <Link
                      href={`/admin/shops/${u.shop.id}`}
                      className="hover:text-[#00B4A6] hover:underline"
                    >
                      {u.shop.name}
                    </Link>
                    {!u.shop.adminUserId && (
                      <span className="text-amber-600"> · shop has no admin</span>
                    )}
                    {" · registered "}
                    {formatWhen(u.createdAt)}
                    {u.approvedAt && (
                      <>
                        {" · handled "}
                        {formatWhen(u.approvedAt)}
                        {reviewer && ` by ${reviewer}`}
                      </>
                    )}
                  </div>
                </div>

                {u.status === "PENDING" && (
                  <ReviewActions endpoint={`/api/users/${u.id}/review`} />
                )}
              </ReviewRow>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
        active
          ? "border-[#00B4A6] bg-teal-50 text-teal-700"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
      }`}
    >
      {children}
    </Link>
  );
}
