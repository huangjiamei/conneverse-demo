/**
 * 路由策略 —— proxy.ts 和页面共用同一份规则,避免两处判断打架。
 *
 * 公开: / (login) · /register · /pending · 以及它们要打的几个 API。
 * 其余一律要 APPROVED 会话;/admin/** 额外要 PLATFORM_ADMIN。
 */

import type { Session } from "./types";

/** 登录/注册/待审核 —— 未登录可访问 */
const PUBLIC_PAGES = new Set(["/", "/register", "/pending"]);

/** 公开 API (登录注册流程本身要用) */
const PUBLIC_APIS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/shops",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PAGES.has(pathname) || PUBLIC_APIS.includes(pathname);
}

/**
 * 登录后该去哪 —— 三种角色统一落在 Search。
 * 平台管理员靠头部的 Admin 链接进后台,店铺管理员靠 My Shop。
 */
export function landingPath(session: Session): string {
  if (session.status !== "APPROVED") return "/pending";
  return "/search";
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Repair-Order 流程只对平台管理员开放。
 *
 * 门店用户走的是 /search 那条独立车辆搜索链路,不碰 CCC 导入的 RO。
 * 页面和支撑它的接口一起锁 —— 只藏导航链接等于没防护。
 */
const PLATFORM_ONLY_PREFIXES = [
  "/ro",
  "/api/upload-ro",
  "/api/repair-orders",
  "/api/part-lines",
];

/** 已登录用户能否进这个路径 */
export function canAccess(session: Session, pathname: string): boolean {
  if (session.status !== "APPROVED") {
    return pathname === "/pending";
  }
  // 平台后台
  if (isUnder(pathname, "/admin") || isUnder(pathname, "/api/admin")) {
    return session.role === "PLATFORM_ADMIN";
  }
  if (PLATFORM_ONLY_PREFIXES.some((p) => isUnder(pathname, p))) {
    return session.role === "PLATFORM_ADMIN";
  }
  // 单次搜索的 "Admin view" (/search/history/<id>) —— 内部表格,含 optimizer
  // 分数和 gate 原因。列表页 /search/history 本身对所有人开放,门店用户从
  // 那里进的是 /results/<id> 那个客户视图。
  if (pathname.startsWith("/search/history/")) {
    return session.role === "PLATFORM_ADMIN";
  }
  // My Shop —— 平台管理员也放行 (他看得到一切),EMPLOYEE 挡掉。
  // /team 是旧路径,页面里 redirect 到 /shop,这里一并放行免得先被弹走。
  if (isUnder(pathname, "/shop") || isUnder(pathname, "/team")) {
    return session.role === "SHOP_ADMIN" || session.role === "PLATFORM_ADMIN";
  }
  return true;
}

/** 已登录还去 / 或 /register → 弹回各自 landing */
export function shouldRedirectAwayFrom(pathname: string): boolean {
  return pathname === "/" || pathname === "/register";
}

export const ROLE_LABEL: Record<Session["role"], string> = {
  PLATFORM_ADMIN: "Platform Admin",
  SHOP_ADMIN: "Shop Admin",
  EMPLOYEE: "Employee",
};
