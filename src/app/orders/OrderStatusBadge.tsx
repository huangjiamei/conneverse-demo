/**
 * 店铺侧状态徽章 —— 显示的永远是 shopFacingStatus 的说法。
 *
 * 内部 7 个状态在这里塌成 6 种;PAID 和 PURCHASED 都印 "Processing",
 * 因为 PURCHASED 的含义("我们已经去上游买了")本身就会暴露供应商的存在。
 */

import type { OrderStatus } from "@prisma/client";
import { shopFacingStatus, type ShopFacingStatus } from "@/lib/orders/status";

const TONE_CLS: Record<ShopFacingStatus["tone"], string> = {
  neutral: "bg-gray-100 text-gray-600 border-gray-300",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  progress: "bg-teal-50 text-teal-700 border-teal-200",
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-red-50 text-red-700 border-red-200",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = shopFacingStatus(status);
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONE_CLS[s.tone]}`}
    >
      {s.label}
    </span>
  );
}
