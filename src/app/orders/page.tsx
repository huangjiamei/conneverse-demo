/**
 * /orders —— 店铺侧订单列表。
 *
 * 可见范围复用 lib/orders/scope 的三档规则 (平台管理员全部 / 店铺管理员本店 /
 * 员工只看自己),和搜索历史是同一套。
 *
 * 这页只显示店铺该看的:商品、全包价、数量、状态、物流号。
 * eBay 链接 / actualCost / 差价 / externalOrderId 在这一层根本不查出来 ——
 * select 里没有它们,所以不存在"忘了不渲染"这种失误。
 */

import Link from "next/link";
import { Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireLiveSession } from "@/lib/auth/liveSession";
import { orderVisibilityWhere } from "@/lib/orders/scope";
import { shopFacingStatus } from "@/lib/orders/status";
import { EmptyState, PageHeader, formatWhen } from "@/components/review/shell";
import { OrderStatusBadge } from "./OrderStatusBadge";

export const dynamic = "force-dynamic";

export const metadata = { title: "Orders — PartHand" };

export default async function OrdersPage() {
  const session = await requireLiveSession();

  const orders = await prisma.purchaseOrder.findMany({
    where: orderVisibilityWhere(session),
    orderBy: { createdAt: "desc" },
    take: 200,
    // ↓ 刻意不 select supplierItemUrl / actualCost / externalOrderId
    select: {
      id: true,
      createdAt: true,
      title: true,
      imageUrl: true,
      quantity: true,
      quotedPrice: true,
      currency: true,
      status: true,
      carrier: true,
      trackingNumber: true,
      orderedByUser: { select: { name: true, email: true } },
    },
  });

  // 员工只看得到自己的单, 就不必再标"谁下的"
  const showWhoOrdered = session.role !== "EMPLOYEE";

  return (
    <main className="w-full max-w-[1280px] mx-auto p-6">
      <PageHeader
        title="Orders"
        subtitle="Parts you've ordered through PartHand."
        right={
          <Link
            href="/search"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#00B4A6] px-3 py-2 text-[13px] font-medium text-white transition hover:bg-[#00A396]"
          >
            <Package size={14} />
            Find a part
          </Link>
        }
      />

      {orders.length === 0 ? (
        <EmptyState>
          No orders yet. Search for a part and place your first order.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {orders.map((o) => {
            const s = shopFacingStatus(o.status);
            const total = (Number(o.quotedPrice) * o.quantity).toFixed(2);
            return (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 transition hover:border-[#00B4A6]"
                >
                  {o.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={o.imageUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg border border-gray-100 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
                      <Package size={18} className="text-gray-300" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[#1A1A2E]">
                      {o.title}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {formatWhen(o.createdAt)}
                      {o.quantity > 1 && ` · Qty ${o.quantity}`}
                      {showWhoOrdered &&
                        o.orderedByUser &&
                        ` · ${o.orderedByUser.name ?? o.orderedByUser.email}`}
                    </div>
                    {/* 物流号只有 SHIPPED 之后才有 —— PAID/PURCHASED 都是 Processing */}
                    {o.status === "SHIPPED" && o.trackingNumber && (
                      <div className="mt-0.5 text-xs text-gray-500">
                        {o.carrier} · {o.trackingNumber}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-[#1A1A2E]">
                      ${total}
                    </div>
                    <div className="mt-1">
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </div>
                </Link>
                {s.detail && (
                  <p className="mt-1 px-4 text-xs text-amber-700">{s.detail}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
