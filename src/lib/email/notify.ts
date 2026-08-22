/**
 * 通知触发点 —— 「什么时候给谁发哪封」全部集中在这里。
 *
 * 三条约定:
 *   · 收件人一律在这里从库里查出来,调用方只传 userId (§D 不信前端)。
 *   · 每个函数都吞掉自己的异常 —— 主流程 (注册 / 验证 / 审核) 绝不因为
 *     发信失败而失败,只留日志 (§A 容错)。
 *   · 只在真正的状态流转之后调用,幂等由调用方的 CAS/事务保证 (§B)。
 */

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/appUrl";
import { issueEmailVerificationToken } from "@/lib/auth/emailVerification";
import { sendEmail } from "./resend";
import * as t from "./templates";

/** trim + 丢空 + 按小写去重 —— Admin 表和兜底走同一套归一 */
function normalizeRecipients(raw: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const e = r?.trim();
    if (!e) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/**
 * 平台管理员收件人 —— Admin 表里的每一个人。
 *
 * ADMIN_NOTIFY_EMAIL 只是「没有任何可用收件人」时的兜底 (刚建库、管理员被删光、
 * 或者查库挂了),不是常规收件人:两边都发会让唯一那位管理员收到两封一样的信。
 *
 * 判「有没有可用收件人」用的是归一之后的结果,不是行数 —— 否则一行邮箱是空白的
 * Admin 会让兜底不触发,结果谁都收不到。
 *
 * 去重按小写: Admin.email 的 unique 是大小写敏感的,`A@x.com` 和 `a@x.com`
 * 能同时存在,不归一就会给同一个人发两封。
 */
async function platformAdminRecipients(): Promise<string[]> {
  let rows: string[] = [];
  try {
    const admins = await prisma.admin.findMany({ select: { email: true } });
    rows = admins.map((a) => a.email);
  } catch (err) {
    console.error("[notify] could not read platform admins", err);
  }

  const admins = normalizeRecipients(rows);
  if (admins.length > 0) return admins;

  return normalizeRecipients([process.env.ADMIN_NOTIFY_EMAIL]);
}

/** 该用户是否还有一条在审的「认领店铺管理员」申请 —— 决定邮件里的措辞 */
async function hasPendingAdminClaim(userId: string): Promise<boolean> {
  const n = await prisma.shopAdminRequest.count({
    where: { userId, status: "PENDING" },
  });
  return n > 0;
}

// ═══════════════════════════════════════════════════════════════
//  注册 / 重发 → verifyEmail
// ═══════════════════════════════════════════════════════════════

/**
 * 签发新令牌并把验证链接发出去。旧链接同时失效。
 *
 * @returns 发信是否成功 —— 调用方通常只用来记日志,不该据此改状态
 */
export async function sendVerificationEmail(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, emailVerified: true },
    });
    if (!user) return false;
    if (user.emailVerified) return false; // 已验证的不再打扰

    const raw = await issueEmailVerificationToken(userId);
    const verifyUrl = `${appUrl()}/verify-email?token=${encodeURIComponent(raw)}`;

    const { subject, html } = t.verifyEmail({ name: user.name, verifyUrl });
    const res = await sendEmail({ to: user.email, subject, html });
    if (!res.ok) console.error(`[notify] verifyEmail not delivered to user ${userId}`);
    return res.ok;
  } catch (err) {
    console.error("[notify] sendVerificationEmail failed", err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  邮箱验证通过 → applicantReceived (用户) + adminNewRequest (平台管理员)
// ═══════════════════════════════════════════════════════════════

/** 只在 consumeEmailVerificationToken 返回 VERIFIED 那一次调用 */
export async function notifyEmailVerified(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        shop: { select: { name: true } },
      },
    });
    if (!user) return;

    const shopName = user.shop?.name ?? null;
    const isAdminClaim = await hasPendingAdminClaim(userId);
    const admins = await platformAdminRecipients();

    const applicant = t.applicantReceived({
      name: user.name,
      shopName,
      isAdminClaim,
    });
    const forAdmins = t.adminNewRequest({
      applicantName: user.name,
      applicantEmail: user.email,
      shopName,
      isAdminClaim,
      reviewUrl: `${appUrl()}/admin/users?status=PENDING`,
    });

    if (admins.length === 0) {
      console.error(
        "[notify] no platform-admin recipient — add an Admin row or set ADMIN_NOTIFY_EMAIL"
      );
    }

    // 管理员一人一封,不是一封塞多个收件人: 后者会让他们在 To 里互相看到
    // 对方邮箱,而且 Resend 只回一个 id,某一位投递失败就分辨不出来。
    // 全部并发,一封发不出去不拖累其它封。
    await Promise.all([
      sendEmail({ to: user.email, ...applicant }),
      ...admins.map((to) => sendEmail({ to, ...forAdmins })),
    ]);
  } catch (err) {
    console.error("[notify] notifyEmailVerified failed", err);
  }
}

// ═══════════════════════════════════════════════════════════════
//  审核 → approved / rejected
// ═══════════════════════════════════════════════════════════════

/** 只在 User.status 真的从 PENDING 翻成 APPROVED 之后调用 */
export async function notifyApproved(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        shop: { select: { name: true } },
        adminOf: { select: { id: true } }, // Shop.adminUserId 反向关系 = 唯一真相
      },
    });
    if (!user) return;

    const { subject, html } = t.approved({
      name: user.name,
      shopName: user.shop?.name ?? null,
      isShopAdmin: user.adminOf != null,
      loginUrl: `${appUrl()}/`,
    });
    await sendEmail({ to: user.email, subject, html });
  } catch (err) {
    console.error("[notify] notifyApproved failed", err);
  }
}

/** 只在 User.status 真的从 PENDING 翻成 REJECTED 之后调用 */
export async function notifyRejected(
  userId: string,
  reason?: string | null
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, shop: { select: { name: true } } },
    });
    if (!user) return;

    const { subject, html } = t.rejected({
      name: user.name,
      shopName: user.shop?.name ?? null,
      reason,
    });
    await sendEmail({ to: user.email, subject, html });
  } catch (err) {
    console.error("[notify] notifyRejected failed", err);
  }
}
