/**
 * Who may see which MatchSearch.
 *
 * One rule, reused by the list, the detail pages, the results API and delete —
 * if these drifted apart you'd get a filtered list with an unfiltered detail
 * page behind it, which is exactly the hole this closes.
 *
 *   PLATFORM_ADMIN → everything
 *   SHOP_ADMIN     → every search made by anyone in their shop
 *   EMPLOYEE       → only their own
 *
 * Ownership is stamped at creation time (see the search APIs). Searches run by
 * a platform admin carry no owner (userId/shopId null), so they stay visible
 * only to platform admins — nobody else can claim them.
 */

import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/types";

export function searchVisibilityWhere(
  session: Session
): Prisma.MatchSearchWhereInput {
  if (session.role === "PLATFORM_ADMIN") return {};
  if (session.role === "SHOP_ADMIN" && session.shopId) {
    return { shopId: session.shopId };
  }
  // EMPLOYEE, 以及理论上不该出现的「没有 shopId 的店铺管理员」——收窄到只看自己
  return { userId: session.id };
}

/**
 * 创建 MatchSearch 时该写的归属。
 * 平台管理员不属于任何店, 两个字段都留空。
 */
export function searchOwnershipFor(
  session: Session
): { userId: string | null; shopId: string | null } {
  if (session.kind !== "user") return { userId: null, shopId: null };
  return { userId: session.id, shopId: session.shopId };
}
