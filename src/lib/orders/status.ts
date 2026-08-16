/**
 * 订单状态:内部状态机 + 店铺看到的简化说法。
 *
 * 内部有 7 个状态,店铺只该看到 6 种说法 —— PAID 和 PURCHASED 都显示
 * "Processing"。这不是偷懒:PURCHASED 的含义是「我们已经去 eBay 买了」,
 * 把它暴露出去等于告诉店铺存在一个上游供应商。屏蔽 eBay 就得从状态词开始。
 *
 * 合法流转集中在这里,履约接口的每个动作都先过 assertTransition —— 重复点
 * "Mark purchased" 的第二次会被这里拦掉,而不是靠前端禁用按钮。
 */

import type { OrderStatus } from "@prisma/client";

/** 只有这些流转是合法的;其余一律拒绝。 */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PURCHASED", "REFUNDED", "CANCELLED"],
  PURCHASED: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

/** 非法流转时给一句能直接回给调用方的话 */
export function transitionError(from: OrderStatus, to: OrderStatus): string {
  return `Cannot move an order from ${from} to ${to}.`;
}

/** 店铺侧文案 —— 不出现 eBay / 供应商 / 采购环节。 */
export type ShopFacingStatus = {
  label: string;
  /** 副标题,只有需要解释时才有 */
  detail: string | null;
  tone: "neutral" | "pending" | "progress" | "good" | "warn";
};

export function shopFacingStatus(status: OrderStatus): ShopFacingStatus {
  switch (status) {
    case "PENDING_PAYMENT":
      return { label: "Awaiting payment", detail: null, tone: "pending" };
    case "PAID":
    case "PURCHASED":
      // 两个内部状态、一个对外说法 —— PURCHASED 会泄露上游存在
      return { label: "Processing", detail: null, tone: "progress" };
    case "SHIPPED":
      return { label: "Shipped", detail: null, tone: "progress" };
    case "DELIVERED":
      return { label: "Delivered", detail: null, tone: "good" };
    case "REFUNDED":
      return {
        label: "Refunded",
        detail: "This item is no longer available at the quoted price.",
        tone: "warn",
      };
    case "CANCELLED":
      return { label: "Cancelled", detail: null, tone: "neutral" };
  }
}

/** 履约面板的排队顺序:待办 (PAID) 置顶,终态沉底。 */
export const FULFILLMENT_PRIORITY: Record<OrderStatus, number> = {
  PAID: 0,
  PURCHASED: 1,
  SHIPPED: 2,
  PENDING_PAYMENT: 3,
  DELIVERED: 4,
  REFUNDED: 5,
  CANCELLED: 6,
};

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PURCHASED",
  "SHIPPED",
  "DELIVERED",
  "REFUNDED",
  "CANCELLED",
];

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && ALL_ORDER_STATUSES.includes(v as OrderStatus);
}
