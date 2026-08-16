/**
 * /admin/orders —— 履约队列,仅平台管理员 (授权在 /admin/layout 已统一做过)。
 *
 * 默认排序把 PAID 顶到最前:那是待办队列 —— 钱收了、还没去 eBay 买。
 * 这里是唯一会显示内部信息的订单视图:eBay 链接、成本、差价、Stripe id。
 */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireLivePlatformAdmin } from "@/lib/auth/liveSession";
import {
  ALL_ORDER_STATUSES,
  FULFILLMENT_PRIORITY,
  isOrderStatus,
} from "@/lib/orders/status";
import { PageHeader, EmptyState } from "@/components/review/shell";
import { AdminOrdersClient, type AdminOrderRow } from "./AdminOrdersClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Orders — Conneverse admin" };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireLivePlatformAdmin();
  const { status } = await searchParams;
  const filter = isOrderStatus(status) ? status : null;

  const orders = await prisma.purchaseOrder.findMany({
    where: filter ? { status: filter } : {},
    take: 300,
    include: {
      shop: { select: { name: true } },
      orderedByUser: { select: { name: true, email: true } },
      partLine: {
        select: { repairOrder: { select: { id: true, cccRoNumber: true } } },
      },
    },
  });

  // 待办优先, 同优先级内按新旧。列表不大, 在内存里排比在 SQL 里编 CASE 清楚。
  orders.sort((a, b) => {
    const p = FULFILLMENT_PRIORITY[a.status] - FULFILLMENT_PRIORITY[b.status];
    return p !== 0 ? p : b.createdAt.getTime() - a.createdAt.getTime();
  });

  const counts = await prisma.purchaseOrder.groupBy({
    by: ["status"],
    _count: true,
  });
  const countByStatus = new Map(counts.map((c) => [c.status, c._count]));

  // Decimal / Date 不能直接过 server→client 边界, 统一转成字符串
  const rows: AdminOrderRow[] = orders.map((o) => ({
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    status: o.status,
    title: o.title,
    imageUrl: o.imageUrl,
    quantity: o.quantity,
    currency: o.currency,
    quotedPrice: String(o.quotedPrice),
    actualCost: o.actualCost == null ? null : String(o.actualCost),
    amountPaid: o.amountPaid == null ? null : String(o.amountPaid),
    refundedAmount: o.refundedAmount == null ? null : String(o.refundedAmount),
    supplierItemUrl: o.supplierItemUrl,
    supplierItemId: o.supplierItemId,
    externalOrderId: o.externalOrderId,
    stripePaymentIntentId: o.stripePaymentIntentId,
    stripeRefundId: o.stripeRefundId,
    cancelReason: o.cancelReason,
    carrier: o.carrier,
    trackingNumber: o.trackingNumber,
    trackingUrl: o.trackingUrl,
    shopName: o.shop.name,
    orderedBy: o.orderedByUser?.name ?? o.orderedByUser?.email ?? null,
    roNumber: o.partLine?.repairOrder?.cccRoNumber ?? null,
    shipTo: [
      o.shipToLine1,
      o.shipToLine2,
      [o.shipToCity, o.shipToState].filter(Boolean).join(", "),
      o.shipToZip,
    ]
      .filter(Boolean)
      .join(" · "),
    shipToPhone: o.shipToPhone,
  }));

  return (
    <main className="w-full max-w-[1280px] mx-auto p-8">
      <PageHeader
        title="Fulfilment"
        subtitle="Paid orders waiting to be bought and shipped."
      />

      {/* 状态筛选 —— 用链接而不是客户端 state, 刷新/分享都还在同一个视图 */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        <FilterChip href="/admin/orders" active={filter == null} label="All" />
        {ALL_ORDER_STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={`/admin/orders?status=${s}`}
            active={filter === s}
            label={s.replace("_", " ").toLowerCase()}
            count={countByStatus.get(s) ?? 0}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState>
          {filter
            ? `No orders with status ${filter.toLowerCase()}.`
            : "No orders yet."}
        </EmptyState>
      ) : (
        <AdminOrdersClient rows={rows} />
      )}
    </main>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium capitalize transition ${
        active
          ? "border-[#00B4A6] bg-teal-50 text-teal-700"
          : "border-gray-200 text-gray-600 hover:border-gray-300"
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span className="tabular-nums text-gray-400">{count}</span>
      )}
    </Link>
  );
}
