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
import {
  issuePasswordResetToken,
  PASSWORD_RESET_TTL_MS,
} from "@/lib/auth/passwordReset";
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

/**
 * 该用户名下在审的店铺管理员申请 —— 决定邮件里的措辞和「去哪审」的落地页。
 * 没有就返回 null,那时待审的只是这个账号本身。
 */
async function pendingAdminRequest(userId: string) {
  return prisma.shopAdminRequest.findFirst({
    where: { userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, shopId: true },
  });
}

/**
 * 平台管理员该点哪个链接去审。
 *
 * 账号本身 → Users 列表;店铺管理员申请 → 那家店的详情页,「Admin requests」
 * 就在那儿 (批准它会连带把申请人置成 APPROVED,一次动作办完两件事)。
 */
function reviewUrlFor(shopId: string | null): string {
  return shopId
    ? `${appUrl()}/admin/shops/${shopId}`
    : `${appUrl()}/admin/users?status=PENDING`;
}

/**
 * 一条待审通知扇给每一个平台管理员 —— 一人一封。
 *
 * adminNewRequest 有两个触发点 (邮箱验证通过 / 已验证的人提交申请),
 * 收件和发送方式必须完全一致,所以收在这里。
 */
async function fanOutToPlatformAdmins(content: t.EmailContent): Promise<void> {
  const admins = await platformAdminRecipients();
  if (admins.length === 0) {
    console.error(
      "[notify] no platform-admin recipient — add an Admin row or set ADMIN_NOTIFY_EMAIL"
    );
    return;
  }
  await Promise.all(admins.map((to) => sendEmail({ to, ...content })));
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
//  落地页 "Book a demo" → demoRequest (全体平台管理员)
// ═══════════════════════════════════════════════════════════════

/**
 * 把一条 demo 申请扇给每一个平台管理员 —— 和 adminNewRequest 走完全同一套
 * 收件人逻辑 (Admin 表全员,一人一封;一个都没有时才退到 ADMIN_NOTIFY_EMAIL)。
 *
 * 刻意不写死单个地址: 线索只落到一个人的收件箱里,那个人休假就没人跟进。
 *
 * TODO: demo@parthand.com 收件箱配好之后,这里换成那个专用地址 —— 到时候
 * 把 fanOutToPlatformAdmins 换成直接 sendEmail 到那一个地址即可,调用方不用动。
 *
 * @returns 至少发出去一封才算 true;调用方据此决定回 200 还是 502
 */
export async function notifyDemoRequest(input: {
  name: string;
  shop: string | null;
  email: string;
  phone: string | null;
  message: string | null;
}): Promise<boolean> {
  try {
    const recipients = await platformAdminRecipients();
    if (recipients.length === 0) {
      console.error(
        "[notify] demo request dropped — no platform-admin recipient (add an Admin row or set ADMIN_NOTIFY_EMAIL)",
        { name: input.name, email: input.email }
      );
      return false;
    }

    const content = t.demoRequest(input);
    const results = await Promise.all(
      recipients.map((to) => sendEmail({ to, ...content }))
    );
    // 部分失败也算收到了 —— 线索已经到了某个人手上,不该让访客重复提交
    return results.some((r) => r.ok);
  } catch (err) {
    console.error("[notify] notifyDemoRequest failed", err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  忘记密码 → passwordReset
// ═══════════════════════════════════════════════════════════════

/**
 * 签发重置令牌并把链接发出去。该用户手上的旧链接同时失效。
 *
 * 收件人从库里取 —— 调用方只传 userId,前端提交的地址一个字都不信 (§D)。
 * 平台 Admin 不走这条路: 这里只查 User 表,Admin 的密码由 DB / Profile 改。
 *
 * @returns 发信是否成功 —— 调用方只该用来记日志。对外的提示必须中性:
 *          发没发出去、账号存不存在,都不能从响应里看出来。
 */
export async function sendPasswordResetEmail(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) return false;

    const raw = await issuePasswordResetToken(userId);
    const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(raw)}`;

    const { subject, html } = t.passwordReset({
      name: user.name,
      resetUrl,
      ttlHours: Math.round(PASSWORD_RESET_TTL_MS / (60 * 60 * 1000)),
    });
    const res = await sendEmail({ to: user.email, subject, html });
    if (!res.ok) {
      console.error(`[notify] passwordReset not delivered to user ${userId}`);
    }
    return res.ok;
  } catch (err) {
    console.error("[notify] sendPasswordResetEmail failed", err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  邮箱验证通过 → applicantReceived (用户) + adminNewRequest (平台管理员)
//                + shopAdminNewMember (本店店铺管理员)
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
    // 注册时勾了「申请当管理员」的话,这条 CLAIM 在注册那一刻就建好了,
    // 但那时人还没验证、不能发信 —— 所以它的通知是在这里补上的。
    const request = await pendingAdminRequest(userId);

    const applicant = t.applicantReceived({
      name: user.name,
      shopName,
      kind: request?.kind ?? "EMPLOYEE",
      justVerified: true, // 就是刚点完验证链接过来的
    });
    const forAdmins = t.adminNewRequest({
      applicantName: user.name,
      applicantEmail: user.email,
      shopName,
      kind: request?.kind ?? "EMPLOYEE",
      reviewUrl: reviewUrlFor(request?.shopId ?? null),
    });

    // 一封发不出去不该拖累另一封
    await Promise.all([
      sendEmail({ to: user.email, ...applicant }),
      fanOutToPlatformAdmins(forAdmins),
      // 真正要审这个人的是店铺管理员 —— 他自己内部再判该不该发
      notifyShopAdminOfNewMember(userId),
    ]);
  } catch (err) {
    console.error("[notify] notifyEmailVerified failed", err);
  }
}

/**
 * 有新成员待审 → 通知这家店的店铺管理员。
 *
 * 员工加入店铺的审核方是**店铺管理员** (reviewUser 允许 SHOP_ADMIN 审本店的人,
 * 界面在 /shop 的 Awaiting approval);平台管理员只是"这家店没有管理员"时的兜底。
 * 在此之前只有平台管理员收得到信,真正要动手的那个人反而不知道 —— 补上。
 *
 * 收件人取 Shop.adminUserId 指向的那个 User 的邮箱 —— 和授权判定用的是同一个
 * 唯一真相,不会给一个已经被 REPLACE 顶掉的旧管理员发信。
 *
 * 触发时机跟着"注册进入待审核"走,也就是邮箱验证通过那一刻,所以:
 *   · 未验证 → 不发 (验证前不算进入待审核)
 *   · 验证通过 → 发一封,由 consumeEmailVerificationToken 的 CAS 保证只有一次
 * 这家店没有管理员时静默跳过 —— 那种情况本来就该由平台管理员兜底审。
 */
async function notifyShopAdminOfNewMember(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        emailVerified: true,
        shop: {
          select: {
            id: true,
            name: true,
            adminUser: { select: { id: true, email: true } },
          },
        },
      },
    });
    if (!user) return;
    if (!user.emailVerified) return; // 还没进入待审核
    if (user.status !== "PENDING") return; // 没什么可审的
    const admin = user.shop?.adminUser;
    if (!admin) return; // 该店无管理员 → 平台管理员那条兜底通知已经发了
    if (admin.id === user.id) return; // 理论上不会,自己审自己没意义

    await sendEmail({
      to: admin.email,
      ...t.shopAdminNewMember({
        applicantName: user.name,
        applicantEmail: user.email,
        shopName: user.shop?.name ?? null,
        reviewUrl: `${appUrl()}/shop`,
      }),
    });
  } catch (err) {
    console.error("[notify] notifyShopAdminOfNewMember failed", err);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ShopAdminRequest 进入待审核
//    → adminNewRequest (平台管理员) + applicantReceived (申请人)
// ═══════════════════════════════════════════════════════════════

/**
 * 一条店铺管理员申请进入待审核时: 通知每一个平台管理员,并给申请人本人回一封
 * 确认 —— 和注册流程收到的是同一封 applicantReceived,只是措辞按「早已验证」调整。
 *
 * 为什么单独有这个入口:adminNewRequest 原先只挂在「邮箱验证通过」上。新注册的人
 * 验证紧跟申请,顺带就发了;但一个**早就验证过**的员工事后提交 CLAIM/REPLACE 时
 * 根本没有验证事件,那条申请就静悄悄躺在库里没人知道。
 *
 * 两条路径靠 emailVerified 分工,天然互斥,所以同一条申请只会发一次:
 *   · 申请人已验证 → 这里在创建时立刻发;之后他不会再有验证事件
 *     (sendVerificationEmail 对已验证的人直接返回,令牌也兑换不出 VERIFIED)
 *   · 申请人未验证 → 这里直接跳过,等 notifyEmailVerified 那边发
 *     (注册时勾选「申请当管理员」建出来的 CLAIM 走的就是这条)
 *
 * 判「验没验证」以库为准,不看调用方传什么 —— 调用点将来多了也不会漏。
 */
export async function notifyShopAdminRequestFiled(
  requestId: string
): Promise<void> {
  try {
    const req = await prisma.shopAdminRequest.findUnique({
      where: { id: requestId },
      select: {
        kind: true,
        status: true,
        shopId: true,
        shop: { select: { name: true } },
        user: { select: { email: true, name: true, emailVerified: true } },
      },
    });
    if (!req) return;
    if (req.status !== "PENDING") return; // 已经审完了,没什么可通知的
    if (!req.user.emailVerified) return; // 未验证 → 交给 notifyEmailVerified

    const shopName = req.shop?.name ?? null;

    // 申请人本人也收一封确认,和注册流程一致。justVerified: false —— 他的邮箱
    // 是早就验证过的,这封信要讲的是「申请收到了」,不是「邮箱验证通过了」。
    const applicant = t.applicantReceived({
      name: req.user.name,
      shopName,
      kind: req.kind,
      justVerified: false,
    });

    // 一封发不出去不该拖累另一封
    await Promise.all([
      sendEmail({ to: req.user.email, ...applicant }),
      fanOutToPlatformAdmins(
        t.adminNewRequest({
          applicantName: req.user.name,
          applicantEmail: req.user.email,
          shopName,
          kind: req.kind,
          reviewUrl: reviewUrlFor(req.shopId),
        })
      ),
    ]);
  } catch (err) {
    console.error("[notify] notifyShopAdminRequestFiled failed", err);
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
      loginUrl: `${appUrl()}/login`,
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
