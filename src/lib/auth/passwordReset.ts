/**
 * 重置密码令牌 —— 签发 / 校验 / 兑换。
 *
 * 形态照抄 emailVerification.ts,同一套安全约定:
 *   · 明文 token 只出现在邮件链接里,库里只有 SHA-256;
 *   · 单次使用,签发新的会作废该用户手上所有旧的;
 *   · 兑换用条件更新 (updateMany where usedAt: null) 做 compare-and-set,
 *     同一个链接被并发提交两次,只有一次 count === 1。
 *
 * 和邮箱验证的三点差别,都是刻意的:
 *   1. TTL 短得多 (1h vs 24h) —— 重置链接等于一次性登录凭证,活得越久越危险。
 *   2. 打开页面【不】消费令牌。邮箱验证点开即完成,重置要等用户填完新密码才算数;
 *      页面只读校验,真正的消费在提交那一下 (顺带也就不怕邮件扫描器预取了)。
 *   3. 兑换和改密码在同一个事务里 —— 不允许出现"令牌作废了但密码没改"。
 *
 * schema 由 Vera 建好,这里只用 Prisma 读写,不碰迁移。
 */

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "./password";

const TOKEN_BYTES = 32;
/** 1 小时 —— 重置链接就是一次性登录凭证,别给它 24h */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * 签发新的重置令牌,同时作废该用户手上所有旧的。
 *
 * @returns 明文 token —— 只能进邮件链接,不许写日志、不许回给前端
 */
export async function issuePasswordResetToken(userId: string): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // 反复申请时,旧链接立即失效 —— 同时只有一个有效令牌
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashResetToken(raw),
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      },
    });
  });

  return raw;
}

export type ResetTokenState = "VALID" | "EXPIRED" | "USED" | "INVALID";

/**
 * 只读校验 —— 给重置页决定"要不要显示设新密码的表单"用。
 *
 * 刻意不消费:用户还没填新密码,这时候作废令牌等于让他白跑一趟。
 */
export async function checkPasswordResetToken(
  rawToken: string
): Promise<ResetTokenState> {
  const trimmed = rawToken.trim();
  if (!trimmed) return "INVALID";

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(trimmed) },
    select: { expiresAt: true, usedAt: true },
  });
  if (!row) return "INVALID";
  if (row.usedAt) return "USED";
  if (row.expiresAt.getTime() <= Date.now()) return "EXPIRED";
  return "VALID";
}

export type ConsumeResetResult =
  | { outcome: "RESET"; userId: string }
  | { outcome: "EXPIRED" }
  | { outcome: "USED" }
  | { outcome: "INVALID" };

/**
 * 兑换令牌并改密码 —— 校验、改密、作废三件事在一个事务里,要么都成要么都不成。
 *
 * bcrypt 大约要 100ms,刻意放在事务【外面】先算好:把它圈进事务只会让这把
 * 行锁多握 100ms,并发重置时白白顶住。
 */
export async function consumePasswordResetToken(
  rawToken: string,
  newPassword: string
): Promise<ConsumeResetResult> {
  const trimmed = rawToken.trim();
  if (!trimmed) return { outcome: "INVALID" };

  const tokenHash = hashResetToken(trimmed);

  // 先便宜地否掉明显无效的,免得为一个假 token 白算一次 bcrypt
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row) return { outcome: "INVALID" };
  if (row.usedAt) return { outcome: "USED" };
  if (row.expiresAt.getTime() <= Date.now()) return { outcome: "EXPIRED" };

  const passwordHash = await hashPassword(newPassword);

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    // CAS: 只有这一刻它仍未被用过才算我们抢到。并发提交同一个链接时,
    // 第二次 count === 0 —— 密码不会被改第二遍。
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return { outcome: "USED" as const };

    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    });

    // 同一个人手上可能还有别的未用链接 (虽然签发时会作废旧的,但并发签发下
    // 仍可能残留),一并作废 —— 改完密码,所有旧链接都不该再能用。
    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: now },
    });

    return { outcome: "RESET" as const, userId: row.userId };
  });
}
