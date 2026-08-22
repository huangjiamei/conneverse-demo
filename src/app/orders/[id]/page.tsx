/**
 * /orders/[id] —— 店铺侧订单详情,也是 Stripe 付完回来的落地页。
 *
 * ?checkout=success → "Order confirmed — processing"
 * ?checkout=cancel  → 一句"没扣款,可以重下"
 *
 * 注意 success 只代表店铺从 Stripe 走回来了,**不代表已收款** —— 真正置 PAID
 * 的是 webhook。所以这页显示的状态一律读库,不读 query 参数;query 只用来
 * 决定要不要在顶上加一条提示。webhook 可能比重定向晚到几秒,那几秒里状态
 * 还是 Awaiting payment,提示语因此写成"确认中"而不是"已付款"。
 *
 * scope 与列表同一份 (orderVisibilityWhere) —— 换个 id 直接开也要挡住。
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireLiveSession } from "@/lib/auth/liveSession";
import { orderVisibilityWhere } from "@/lib/orders/scope";
import { shopFacingStatus } from "@/lib/orders/status";
import { formatWhen } from "@/components/review/shell";
import { OrderStatusBadge } from "../OrderStatusBadge";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await requireLiveSession();
  const { id } = await params;
  const { checkout } = await searchParams;

  // 范围内才给 —— 不在范围内和不存在一样都 404
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, ...orderVisibilityWhere(session) },
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
      trackingUrl: true,
      shipToLine1: true,
      shipToLine2: true,
      shipToCity: true,
      shipToState: true,
      shipToZip: true,
      shipToPhone: true,
      paidAt: true,
      shippedAt: true,
      deliveredAt: true,
      orderedByUser: { select: { name: true, email: true } },
    },
  });
  if (!order) notFound();

  const s = shopFacingStatus(order.status);
  const unit = Number(order.quotedPrice);
  const total = (unit * order.quantity).toFixed(2);

  return (
    /* 宽度与 /orders 列表一致 —— 两页来回跳时内容不该左右跳动 */
    <main className="w-full max-w-[1280px] mx-auto p-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
      >
        <ChevronLeft size={15} />
        Back to orders
      </Link>

      {/* 从 Stripe 回来的提示。状态本身仍以库为准 —— webhook 可能还在路上。 */}
      {checkout === "success" && (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          Order confirmed — processing.
        </div>
      )}
      {checkout === "cancel" && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Checkout cancelled — you haven&apos;t been charged. You can place the
          order again from your search results.
        </div>
      )}

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">
              Order
            </div>
            <div className="mt-0.5 font-mono text-sm text-[#1A1A2E]">
              {order.id}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Placed {formatWhen(order.createdAt)}
              {session.role !== "EMPLOYEE" &&
                order.orderedByUser &&
                ` by ${order.orderedByUser.name ?? order.orderedByUser.email}`}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <OrderStatusBadge status={order.status} />
            {s.detail && (
              <p className="mt-1 max-w-[240px] text-xs text-amber-700">
                {s.detail}
              </p>
            )}
          </div>
        </div>

        {/* 商品 */}
        <div className="mt-5 flex items-start gap-4 border-t border-gray-100 pt-5">
          {order.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={order.imageUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-lg border border-gray-100 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
              <Package size={22} className="text-gray-300" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[#1A1A2E]">
              {order.title}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              ${unit.toFixed(2)} × {order.quantity}
            </div>
            <div className="mt-1 text-xs text-gray-400">
              Fulfilled by PartHand
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold tabular-nums text-[#1A1A2E]">
              ${total}
            </div>
            <div className="text-[11px] text-gray-400">
              {order.currency} · delivered price
            </div>
          </div>
        </div>

        {/* 物流 —— SHIPPED 之后才有内容 */}
        {order.status === "SHIPPED" || order.status === "DELIVERED" ? (
          <div className="mt-5 border-t border-gray-100 pt-5">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">
              Tracking
            </div>
            {order.trackingNumber ? (
              <div className="mt-1 text-sm text-[#1A1A2E]">
                {order.carrier}{" "}
                {order.trackingUrl ? (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[#00B4A6] hover:underline"
                  >
                    {order.trackingNumber}
                  </a>
                ) : (
                  <span className="font-mono">{order.trackingNumber}</span>
                )}
              </div>
            ) : (
              <div className="mt-1 text-sm text-gray-400">
                Tracking will appear here shortly.
              </div>
            )}
            {order.shippedAt && (
              <div className="mt-1 text-xs text-gray-500">
                Shipped {formatWhen(order.shippedAt)}
                {order.deliveredAt &&
                  ` · Delivered ${formatWhen(order.deliveredAt)}`}
              </div>
            )}
          </div>
        ) : null}

        {/* 收货地址 (下单当时的快照) */}
        <div className="mt-5 border-t border-gray-100 pt-5">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">
            Shipping to
          </div>
          <address className="mt-1 text-sm not-italic text-[#1A1A2E]">
            {order.shipToLine1}
            {order.shipToLine2 && <>, {order.shipToLine2}</>}
            <br />
            {order.shipToCity}, {order.shipToState} {order.shipToZip}
            {order.shipToPhone && (
              <>
                <br />
                <span className="text-gray-500">{order.shipToPhone}</span>
              </>
            )}
          </address>
        </div>
      </div>
    </main>
  );
}
