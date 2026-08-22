/**
 * 邮箱验证令牌 —— 签发 / 作废 / 兑换。
 *
 * 安全形态 (§D):
 *   · 明文 token 只存在于邮件链接里,库里只有它的 SHA-256 —— 库被读走也无法伪造链接。
 *   · 单次使用 + 24h 过期;签发新的会把该用户所有旧的未用令牌一并作废。
 *   · 兑换用条件更新 (updateMany where usedAt: null) 做 compare-and-set:
 *     同一个链接被点两次 / 被邮件扫描器预取过,只有第一次 count === 1,
 *     所以"验证通过"的两封通知恰好发一次 (§B 幂等)。
 *
 * schema 由 Vera 手动建好 —— 这里只用 Prisma 读写,不碰迁移。
 */

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** 明文 token 的字节数 (base64url 后约 43 个字符) */
const TOKEN_BYTES = 32;
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * 给用户签发一个新的验证令牌,同时作废他手上所有旧的。
 *
 * @returns 明文 token —— 只能进邮件链接,不许写日志、不许回给前端
 */
export async function issueEmailVerificationToken(
  userId: string
): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // 重发时旧链接立即失效 —— 同时只有一个有效令牌
    await tx.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      },
    });
  });

  return raw;
}

export type ConsumeResult =
  /** 这一次真正完成了验证 —— 调用方负责发"验证通过"的两封通知 */
  | { outcome: "VERIFIED"; userId: string }
  /** 令牌属实但这次没轮到我们盖章 (重复点击 / 扫描器预取) —— 不要重复发信 */
  | { outcome: "ALREADY_VERIFIED"; userId: string }
  | { outcome: "EXPIRED" }
  | { outcome: "USED" }
  | { outcome: "INVALID" };

/**
 * 兑换令牌:命中就把 User 标记为已验证并作废令牌。
 *
 * 刻意不在查询里过滤 usedAt/expiresAt —— 要靠取到的行区分
 * "已经验过了" (友好地照样显示成功) 和 "过期了" (要重发)。
 */
export async function consumeEmailVerificationToken(
  rawToken: string
): Promise<ConsumeResult> {
  const trimmed = rawToken.trim();
  if (!trimmed) return { outcome: "INVALID" };

  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(trimmed) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { emailVerified: true } },
    },
  });
  if (!row) return { outcome: "INVALID" };

  if (row.usedAt) {
    // 同一个链接被点第二次:用户其实已经验过了,别拿"失效"吓他
    return row.user.emailVerified
      ? { outcome: "ALREADY_VERIFIED", userId: row.userId }
      : { outcome: "USED" };
  }
  if (row.expiresAt.getTime() <= Date.now()) return { outcome: "EXPIRED" };

  const now = new Date();
  const claimed = await prisma.emailVerificationToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: now },
  });
  // CAS 落空 = 并发的另一次请求刚刚盖了章,通知由那一边发
  if (claimed.count !== 1) {
    return { outcome: "ALREADY_VERIFIED", userId: row.userId };
  }

  // 令牌已作废,先落库再发信;emailVerified 只在首次翻转时盖时间戳
  await prisma.user.updateMany({
    where: { id: row.userId, emailVerified: false },
    data: { emailVerified: true, emailVerifiedAt: now },
  });

  return row.user.emailVerified
    ? { outcome: "ALREADY_VERIFIED", userId: row.userId }
    : { outcome: "VERIFIED", userId: row.userId };
}
