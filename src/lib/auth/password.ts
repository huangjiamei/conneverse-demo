/**
 * 口令哈希 —— bcryptjs, cost 10。
 *
 * cost 必须和 seed 出来的平台管理员一致 ($2b$10$...),否则登录校验对不上。
 * 纯 JS 实现,不需要原生模块。
 */

import bcrypt from "bcryptjs";

export const BCRYPT_COST = 10;
export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * 密码强度校验 —— 注册和重置密码共用同一条规则。
 *
 * 抽出来是为了让两边不可能走偏: 以前注册那条判断是内联的,重置流程再抄一遍
 * 就会出现"注册要 8 位、重置只要 6 位"这种谁都没注意到的口子。
 *
 * @returns 不合格时的错误文案;合格返回 null
 */
export function validatePassword(plain: unknown): string | null {
  if (typeof plain !== "string" || plain.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
