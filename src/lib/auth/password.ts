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

export function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
