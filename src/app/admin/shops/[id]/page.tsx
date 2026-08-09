/**
 * /admin/shops/[id] —— one shop: who runs it, its pending admin requests, its
 * members, its details, and deletion.
 *
 * This is where the old /admin/shop-admin-requests tab went. The review actions
 * still post to the batch-2 endpoint and therefore still run through review.ts:
 * same transaction, same CAS on adminUserId, same superseding rules. Only the
 * entry point moved.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ReviewActions } from "@/components/review/ReviewActions";
import { ShopInfoForm } from "@/components/shop/ShopInfoForm";
import {
  EmptyState,
  KindBadge,
  ReviewRow,
  StatusBadge,
  formatWhen,
  kindHint,
} from "@/components/review/shell";
import { AssignAdminForm } from "./AssignAdminForm";
import { DeleteShopButton } from "./DeleteShopButton";

export const dynamic = "force-dynamic";

export default async function AdminShopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const shop = await prisma.shop.findUnique({
    where: { id },
    include: {
      adminUser: { select: { id: true, name: true, email: true } },
      members: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
        },
      },
      adminRequests: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { name: true, email: true, status: true } },
        },
      },
      _count: { select: { repairOrders: true } },
    },
  });
  if (!shop) notFound();

  const adminLabel = shop.adminUser
    ? (shop.adminUser.name ?? shop.adminUser.email)
    : null;

  // 只有已批准的成员能被指定为管理员 (和 assignShopAdmin 的校验保持一致)
  const assignable = shop.members
    .filter((m) => m.status === "APPROVED" && m.id !== shop.adminUserId)
    .map((m) => ({ id: m.id, name: m.name, email: m.email }));

  // 删除守卫的理由,提前算好给按钮显示 (服务端还会再判一次)
  const blockers: string[] = [];
  if (shop.members.length > 0) {
    blockers.push(
      `${shop.members.length} member${shop.members.length === 1 ? "" : "s"}`,
    );
  }
  if (shop._count.repairOrders > 0) {
    blockers.push(
      `${shop._count.repairOrders} repair order${shop._count.repairOrders === 1 ? "" : "s"}`,
    );
  }
  const blocked =
    blockers.length > 0
      ? `Still has ${blockers.join(" and ")}. Move or remove them before deleting.`
      : null;

  const where = [shop.city, shop.state].filter(Boolean).join(", ");

  return (
    <main className="w-full max-w-[1280px] mx-auto p-8">
      <Link
        href="/admin/shops"
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
      >
        <ChevronLeft size={15} />
        All shops
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">{shop.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {where || "No address on file"} · {shop.members.length} member
            {shop.members.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* 左: 店铺自身信息 (含删除) · 右: 人员 (管理员 / 申请 / 成员)。
          左栏定宽 460px 是为了让 Shop info 里的 city/state/zip 四列网格还站得开;
          右边的列表吃剩余空间。lg 以下堆叠。 */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {/* ---- Shop info (platform admin may rename) ---- */}
          <section>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500">
              Shop info
            </h2>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <ShopInfoForm
                canEditName
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
          {/* ---- Danger zone ---- */}
          <section>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500">
              Danger zone
            </h2>
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-5">
              <DeleteShopButton
                shopId={shop.id}
                shopName={shop.name}
                blocked={blocked}
              />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {/* ---- Shop admin ---- */}
          <section>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500">
              Shop admin
            </h2>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="text-sm">
                {shop.adminUser ? (
                  <>
                    <span className="font-medium text-[#1A1A2E]">
                      {shop.adminUser.name ?? "—"}
                    </span>{" "}
                    <span className="text-gray-500">
                      {shop.adminUser.email}
                    </span>
                  </>
                ) : (
                  <span className="font-medium text-amber-600">
                    No admin — this shop&apos;s registrations can only be
                    reviewed from the Users tab.
                  </span>
                )}
              </div>

              <div className="mt-4 border-t border-gray-100 pt-4">
                <AssignAdminForm
                  shopId={shop.id}
                  shopName={shop.name}
                  members={assignable}
                  currentAdminLabel={adminLabel}
                />
              </div>
            </div>
          </section>
          {/* ---- Pending admin requests (was /admin/shop-admin-requests) ---- */}
          <section>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500">
              Admin requests ({shop.adminRequests.length})
            </h2>
            {shop.adminRequests.length === 0 ? (
              <EmptyState>No pending requests for this shop.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {shop.adminRequests.map((r) => (
                  <ReviewRow key={r.id}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[#1A1A2E]">
                          {r.user.name ?? "—"}
                        </span>
                        <span className="text-sm text-gray-500">
                          {r.user.email}
                        </span>
                        <StatusBadge status={r.user.status} />
                        <KindBadge kind={r.kind} />
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        Filed {formatWhen(r.createdAt)}
                      </div>
                      {r.note && (
                        <p className="mt-1.5 text-[13px] italic text-gray-600">
                          “{r.note}”
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-gray-400">
                        {kindHint(r.kind)}
                      </p>
                    </div>
                    <ReviewActions
                      endpoint={`/api/admin/shop-admin-requests/${r.id}`}
                      confirmApprove={
                        r.kind === "REPLACE"
                          ? `Approve this REPLACE? ${r.user.email} becomes the admin of ${shop.name}, and ${adminLabel ?? "the current admin"} is demoted to a regular employee.`
                          : undefined
                      }
                    />
                  </ReviewRow>
                ))}
              </ul>
            )}
          </section>
          {/* ---- Members ---- */}
          <section>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500">
              Members ({shop.members.length})
            </h2>
            {shop.members.length === 0 ? (
              <EmptyState>No members yet.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {shop.members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium text-[#1A1A2E]">
                        {m.name ?? "—"}
                      </span>
                      <span className="text-sm text-gray-500">{m.email}</span>
                      <StatusBadge status={m.status} />
                      {shop.adminUserId === m.id && (
                        <span className="inline-block rounded border border-[#00B4A6]/40 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                          Admin
                        </span>
                      )}
                    </div>
                    {m.status === "PENDING" && (
                      <ReviewActions endpoint={`/api/users/${m.id}/review`} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
