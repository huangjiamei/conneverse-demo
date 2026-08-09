/**
 * /shop —— "My Shop" for a shop admin: members + editable shop info.
 * Replaces the old /team, which now redirects here.
 *
 * 布局与 /admin/shops/[id] 一致: 左 Shop info, 右人员。
 *
 * Everything is scoped to session.shopId, which comes from getLiveSession (i.e.
 * from Shop.adminUserId). No shopId ever arrives from the client — the member
 * review API re-checks ownership on its own, and PATCH /api/shops/[id] confirms
 * this admin runs this shop before applying its narrower field whitelist.
 *
 * Platform admins get sent to /admin/shops instead: they have no "own" shop.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireLiveSession } from "@/lib/auth/liveSession";
import { landingPath } from "@/lib/auth/routes";
import { ReviewActions } from "@/components/review/ReviewActions";
import { ShopInfoForm } from "@/components/shop/ShopInfoForm";
import {
  EmptyState,
  PageHeader,
  ReviewRow,
  StatusBadge,
  formatWhen,
} from "@/components/review/shell";

export const dynamic = "force-dynamic";

export default async function MyShopPage() {
  const session = await requireLiveSession();

  if (session.role === "PLATFORM_ADMIN") redirect("/admin/shops");
  if (session.role !== "SHOP_ADMIN" || !session.shopId) {
    redirect(landingPath(session));
  }

  const shop = await prisma.shop.findUnique({
    where: { id: session.shopId },
    include: {
      members: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: {
          approvedByUser: { select: { email: true } },
          approvedByAdmin: { select: { email: true } },
        },
      },
    },
  });
  if (!shop) redirect(landingPath(session));

  const pending = shop.members.filter((m) => m.status === "PENDING");
  const rest = shop.members.filter((m) => m.status !== "PENDING");
  const where = [shop.city, shop.state].filter(Boolean).join(", ");

  return (
    <main className="w-full max-w-[1280px] mx-auto p-8">
      <PageHeader
        title="My Shop"
        subtitle={`${shop.name}${where ? ` — ${where}` : ""} · you administer this shop`}
        right={
          <Link
            href="/search"
            className="text-[13px] font-medium text-[#00B4A6] hover:underline whitespace-nowrap"
          >
            Back to app
          </Link>
        }
      />

      {/* 左: 本店信息 (店名只读) · 右: 人员 (待批 + 成员)。
          与 /admin/shops/[id] 同一套骨架。左栏定宽 460px 是为了让 Shop info
          里 city/state/zip 那行四列网格站得开;lg 以下堆叠。 */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {/* ---- 左栏: Shop info (店名只读) ---- */}
          <section>
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-500 mb-3">
              Shop info
            </h2>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <ShopInfoForm
                canEditName={false}
                shop={{
                  id: shop.id,
                  name: shop.name,
                  type: shop.type,
                  phone: shop.phone,
                  addressLine1: shop.addressLine1,
                  addressLine2: shop.addressLine2,
                  city: shop.city,
                  state: shop.state,
                  zip: shop.zip,
                  country: shop.country,
                }}
              />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {/* ---- 右栏: 待批员工 + 成员列表 ---- */}
          <section>
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-500 mb-3">
              Awaiting approval ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <EmptyState>No one is waiting for approval right now.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {pending.map((u) => (
                  <ReviewRow key={u.id}>
                    <div className="min-w-0">
                      <div className="font-medium text-[#1A1A2E]">
                        {u.name ?? "—"}
                      </div>
                      <div className="mt-0.5 text-sm text-gray-500">
                        {u.email}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        Registered {formatWhen(u.createdAt)}
                      </div>
                    </div>
                    <ReviewActions endpoint={`/api/users/${u.id}/review`} />
                  </ReviewRow>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-500 mb-3">
              Members ({rest.length})
            </h2>
            {rest.length === 0 ? (
              <EmptyState>No members yet.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {rest.map((u) => {
                  const reviewer =
                    u.approvedByUser?.email ?? u.approvedByAdmin?.email ?? null;
                  return (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-[#1A1A2E]">
                            {u.name ?? "—"}
                          </span>
                          <span className="text-sm text-gray-500">
                            {u.email}
                          </span>
                          <StatusBadge status={u.status} />
                          {shop.adminUserId === u.id && (
                            <span className="inline-block rounded border border-[#00B4A6]/40 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                              Admin
                            </span>
                          )}
                          {u.id === session.id && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                              you
                            </span>
                          )}
                        </div>
                        {u.approvedAt && (
                          <div className="mt-0.5 text-xs text-gray-400">
                            Handled {formatWhen(u.approvedAt)}
                            {reviewer && ` by ${reviewer}`}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
