/**
 * Who may see which PurchaseOrder.
 *
 * 与 lib/searchScope 同一套规则、同一个理由:列表、详情、接口共用一个 where,
 * 否则就会出现「列表过滤了、换个 id 直接打详情却没过滤」的洞。
 *
 *   PLATFORM_ADMIN → everything (他负责履约)
 *   SHOP_ADMIN     → 本店所有人下的单
 *   EMPLOYEE       → 只有自己下的单
 *
 * 归属在下单时从会话盖上 (shopId + orderedByUserId),不信客户端传的 shopId。
 */

import type { Prisma, OrderStatus } from "@prisma/client";
import type { Session } from "@/lib/auth/types";

export function orderVisibilityWhere(
  session: Session
): Prisma.PurchaseOrderWhereInput {
  if (session.role === "PLATFORM_ADMIN") return {};
  if (session.role === "SHOP_ADMIN" && session.shopId) {
    return { shopId: session.shopId };
  }
  // EMPLOYEE, 以及理论上不该出现的「没有 shopId 的店铺管理员」—— 收窄到只看自己
  return { orderedByUserId: session.id };
}

/**
 * 占着这个 candidate 的状态。走到终态 (DELIVERED / CANCELLED / REFUNDED)
 * 就释放,店铺可以对同一件重新下单 —— 涨价或断货退款后往往正是要重下。
 */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PURCHASED",
  "SHIPPED",
];

/** 谁能下单:带 shopId 的用户。平台管理员不下单 —— 他们是履约方。 */
export function canPlaceOrder(
  session: Session
): session is Session & { shopId: string } {
  return session.role !== "PLATFORM_ADMIN" && !!session.shopId;
}
