/**
 * 用库里的现状复核会话 —— 权威版的 getSession()。
 *
 * 为什么需要:role 和 status 是登录那一刻写进 JWT 的,之后会过期失真。
 *   · 管理员被 REPLACE 顶掉 → 旧 token 里仍写着 SHOP_ADMIN
 *   · 用户被 DISABLED/REJECTED → 旧 token 里仍写着 APPROVED
 * 两种情况下,权限都会一直保留到 token 过期 (8 小时)。
 *
 * 所以「是不是店铺管理员」始终以 Shop.adminUserId 为准:凡是授权判断和
 * 敏感动作,一律走这里,不信 JWT 里的 role。
 *
 * 分工:
 *   proxy.ts        → getSession/verifySessionToken (只验签,不查库,乐观拦截)
 *   页面 / 写接口   → getLiveSession (查一次库,权威)
 * 这也正是 Next 官方对 Proxy 的建议:乐观检查放前面,真正的鉴权放后面。
 */

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "./session";
import { landingPath } from "./routes";
import type { Session } from "./types";

/**
 * 会话 + 从库里顺带取到的店名。
 *
 * shopName 刻意不进 JWT:token 是登录那一刻签的,店铺改名后就对不上了。
 * 这里本来就要查一次库,顺路 select 出来最新的。
 */
export type LiveSession = Session & { shopName: string | null };

/**
 * @returns 与库一致的会话;账号已不存在 / 已不是 APPROVED / 邮箱未验证时返回
 *          null (调用方一律当作未登录)
 */
export async function getLiveSession(): Promise<LiveSession | null> {
  const claimed = await getSession();
  if (!claimed) return null;

  if (claimed.kind === "admin") {
    const admin = await prisma.admin.findUnique({
      where: { id: claimed.id },
      select: { id: true, name: true, email: true },
    });
    if (!admin) return null; // 平台管理员已被删
    return {
      id: admin.id,
      kind: "admin",
      role: "PLATFORM_ADMIN",
      shopId: null,
      status: "APPROVED",
      name: admin.name,
      email: admin.email,
      shopName: null, // 平台管理员不属于任何店
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: claimed.id },
    select: {
      id: true,
      name: true,
      email: true,
      shopId: true,
      status: true,
      emailVerified: true,
      adminOf: { select: { id: true } }, // Shop.adminUserId 的反向关系 = 唯一真相
      shop: { select: { name: true } },
    },
  });
  if (!user) return null;
  if (user.status !== "APPROVED") return null; // 登录后被停用/拒绝
  // 登录守卫已经拦过一道;这里再判一次是为了让"未验证"和 status 一样,
  // 任何一次请求都以库为准 —— 手工把 emailVerified 改回 false 也能立刻生效
  if (!user.emailVerified) return null;

  return {
    id: user.id,
    kind: "user",
    role: user.adminOf ? "SHOP_ADMIN" : "EMPLOYEE",
    shopId: user.shopId,
    status: "APPROVED",
    name: user.name,
    email: user.email,
    shopName: user.shop.name,
  };
}

/** 页面里用:按库里的现状要求已登录 */
export async function requireLiveSession(): Promise<LiveSession> {
  const session = await getLiveSession();
  if (!session) redirect("/");
  return session;
}

/** 页面里用:按库里的现状要求平台管理员 */
export async function requireLivePlatformAdmin(): Promise<LiveSession> {
  const session = await requireLiveSession();
  if (session.role !== "PLATFORM_ADMIN") redirect(landingPath(session));
  return session;
}

/** 页面里用:按库里的现状要求店铺管理员 (平台管理员不算,他没有本店) */
export async function requireLiveShopAdmin(): Promise<
  LiveSession & { shopId: string }
> {
  const session = await requireLiveSession();
  if (session.role !== "SHOP_ADMIN" || !session.shopId) {
    redirect(landingPath(session));
  }
  return session as LiveSession & { shopId: string };
}
