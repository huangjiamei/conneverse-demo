/**
 * Session shape shared by proxy (route guard), server components and API routes.
 *
 * 三种 actor 在登录时解析出来 (见 lib/auth/resolve.ts):
 *   PLATFORM_ADMIN — Admin 表里有这条 email,最高权限,不属于任何店
 *   SHOP_ADMIN     — 某个 Shop.adminUserId 指向他的 User
 *   EMPLOYEE       — 已批准但不是任何店管理员的 User
 *
 * 这个文件不许 import prisma / next/headers —— proxy.ts 要用它。
 */

export type Role = "PLATFORM_ADMIN" | "SHOP_ADMIN" | "EMPLOYEE";

export type AccountStatus = "PENDING" | "APPROVED" | "REJECTED" | "DISABLED";

export type Session = {
  id: string;
  kind: "admin" | "user";
  role: Role;
  /** null for platform admin —— 他不属于任何店 */
  shopId: string | null;
  /** admin 恒为 APPROVED */
  status: AccountStatus;
  name: string | null;
  email: string;
};
