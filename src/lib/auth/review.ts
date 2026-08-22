/**
 * 审核动作 —— 平台管理员审 ShopAdminRequest,平台/店铺管理员审 User。
 *
 * 全部集中在这里,API route 只负责鉴权 + 把结果码翻成 HTTP 状态。
 *
 * 邮箱验证是批准的硬前置 (§B 顺序): 没验证的注册不算正式进入待审核,所以这里
 * 直接拒绝批准 —— 光在列表页隐藏按钮不算防护。拒绝不受此限 (垃圾注册照样能否掉)。
 *
 * 发信不在这里做: 这些函数跑在事务里,事务提交前不能发 (§D 先落库、后发信)。
 * 调用方 (API route) 拿到 ok 结果之后再按 userId 触发通知,收件人由 notify 层
 * 自己回库查 —— 事务已提交,读到的必然是新状态。
 *
 * 竞态处理用「条件更新」(compare-and-set) 而不是提高隔离级别:
 *   updateMany({ where: { id, adminUserId: <读到的值> } })
 * 只有 adminUserId 仍是我们读到的那个值时才会命中 (count === 1)。
 * 两条 CLAIM 同时批准,第二条的 CAS 必然落空 → 走冲突分支,不会互相覆盖。
 * 这比 Serializable 好:不会抛序列化失败让调用方重试。
 */

import { prisma } from "@/lib/prisma";
import type { Prisma, ShopAdminRequestKind } from "@prisma/client";

export type ReviewFailure =
  | "NOT_FOUND"
  | "ALREADY_HANDLED"
  | "EMAIL_UNVERIFIED"
  | "SHOP_HAS_ADMIN"
  | "ALREADY_ADMIN"
  | "NOT_A_MEMBER"
  | "RACE_LOST"
  | "FORBIDDEN";

export type ReviewResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: ReviewFailure; message: string };

function fail(code: ReviewFailure, message: string): ReviewResult<never> {
  return { ok: false, code, message };
}

/** 谁在审 —— 平台管理员盖 approvedByAdminId,店铺管理员盖 approvedByUserId */
export type Reviewer =
  | { kind: "admin"; id: string }
  | { kind: "user"; id: string; shopId: string };

// ═══════════════════════════════════════════════════════════════
//  ShopAdminRequest —— 只有平台管理员能审
// ═══════════════════════════════════════════════════════════════

export async function approveShopAdminRequest(
  requestId: string,
  adminId: string
): Promise<
  ReviewResult<{
    shopId: string;
    shopName: string;
    kind: ShopAdminRequestKind;
    newAdminUserId: string;
    previousAdminUserId: string | null;
    alsoRejected: number;
  }>
> {
  return prisma.$transaction(async (tx) => {
    const req = await tx.shopAdminRequest.findUnique({
      where: { id: requestId },
      select: { id: true, shopId: true, userId: true, kind: true, status: true },
    });
    if (!req) return fail("NOT_FOUND", "Request not found.");
    if (req.status !== "PENDING") {
      return fail("ALREADY_HANDLED", "This request has already been handled.");
    }

    // 事务内重读店铺现状 —— 决策必须基于这一刻的 adminUserId
    const shop = await tx.shop.findUnique({
      where: { id: req.shopId },
      select: { id: true, name: true, adminUserId: true },
    });
    if (!shop) return fail("NOT_FOUND", "Shop not found.");

    const now = new Date();

    // 申请人必须确实属于这家店 (注册流程保证;脚本插的数据可能不保证)
    const applicant = await tx.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        shopId: true,
        status: true,
        emailVerified: true,
      },
    });
    if (!applicant) return fail("NOT_FOUND", "Applicant not found.");
    if (applicant.shopId !== req.shopId) {
      return fail(
        "NOT_A_MEMBER",
        "The applicant is not a member of this shop."
      );
    }
    // 批准会把他置成 APPROVED —— 邮箱没验证的人不该被放进来
    if (!applicant.emailVerified) {
      return fail(
        "EMAIL_UNVERIFIED",
        "This applicant hasn't verified their email address yet. The request isn't ready for review."
      );
    }
    if (shop.adminUserId === req.userId) {
      return fail("ALREADY_ADMIN", "This user is already the shop's admin.");
    }

    // ---- CLAIM: 该店必须仍然无管理员 ----
    if (req.kind === "CLAIM" && shop.adminUserId !== null) {
      // 别人先被批准了 —— 这条已不可能胜出,直接判负
      await tx.shopAdminRequest.update({
        where: { id: req.id },
        data: {
          status: "REJECTED",
          note: "shop already had an admin",
          reviewedByAdminId: adminId,
          reviewedAt: now,
        },
      });
      return fail(
        "SHOP_HAS_ADMIN",
        "This shop already has an admin. The request was rejected."
      );
    }

    // ---- 认领 / 换人 (CAS: 只有 adminUserId 仍是刚才读到的值才生效) ----
    const previousAdminUserId = shop.adminUserId;
    const swapped = await tx.shop.updateMany({
      where: { id: req.shopId, adminUserId: previousAdminUserId },
      data: { adminUserId: req.userId },
    });
    if (swapped.count !== 1) {
      return fail(
        "RACE_LOST",
        "The shop's admin changed while you were reviewing. Reload and try again."
      );
    }

    // 新管理员必须是 APPROVED 用户 (CLAIM 时他还是 PENDING)
    await tx.user.update({
      where: { id: req.userId },
      data: {
        status: "APPROVED",
        approvedByAdminId: adminId,
        approvedAt: now,
      },
    });

    await tx.shopAdminRequest.update({
      where: { id: req.id },
      data: { status: "APPROVED", reviewedByAdminId: adminId, reviewedAt: now },
    });

    // 同店其余在审请求作废。
    // CLAIM 通过 → 只废掉其它 CLAIM (针对新管理员的 REPLACE 仍是有效诉求);
    // REPLACE 通过 → CLAIM 和 REPLACE 一起废掉。按指令 §1 的两处措辞区分。
    const supersededKinds: ShopAdminRequestKind[] =
      req.kind === "CLAIM" ? ["CLAIM"] : ["CLAIM", "REPLACE"];
    const alsoRejected = await tx.shopAdminRequest.updateMany({
      where: {
        shopId: req.shopId,
        status: "PENDING",
        id: { not: req.id },
        kind: { in: supersededKinds },
      },
      data: {
        status: "REJECTED",
        note: "another admin was approved",
        reviewedByAdminId: adminId,
        reviewedAt: now,
      },
    });

    return {
      ok: true as const,
      shopId: shop.id,
      shopName: shop.name,
      kind: req.kind,
      newAdminUserId: req.userId,
      previousAdminUserId,
      alsoRejected: alsoRejected.count,
    };
  });
}

export async function rejectShopAdminRequest(
  requestId: string,
  adminId: string,
  note?: string
): Promise<ReviewResult<{ requestId: string }>> {
  return prisma.$transaction(async (tx) => {
    const req = await tx.shopAdminRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });
    if (!req) return fail("NOT_FOUND", "Request not found.");
    if (req.status !== "PENDING") {
      return fail("ALREADY_HANDLED", "This request has already been handled.");
    }

    // 只否掉"当管理员"这件事 —— 不碰 shop,也不碰申请人的 User.status,
    // 因为拒绝当管理员 ≠ 拒绝当员工。
    await tx.shopAdminRequest.update({
      where: { id: req.id },
      data: {
        status: "REJECTED",
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
        ...(note ? { note } : {}),
      },
    });
    return { ok: true as const, requestId: req.id };
  });
}

/**
 * 平台管理员从「已 APPROVED 的成员」里直接指定/更换店铺管理员。
 *
 * 等价于一次直接批准的 REPLACE:同一套事务 + 同一个 CAS 换人,
 * 旧管理员照样靠 adminUserId 派生而自动降级 (不改他任何字段)。
 * 同店在审的 CLAIM/REPLACE 一并作废 —— 管理员已经定了。
 */
export async function assignShopAdmin(
  shopId: string,
  userId: string,
  adminId: string
): Promise<
  ReviewResult<{
    shopId: string;
    newAdminUserId: string;
    previousAdminUserId: string | null;
    alsoRejected: number;
  }>
> {
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({
      where: { id: shopId },
      select: { id: true, adminUserId: true },
    });
    if (!shop) return fail("NOT_FOUND", "Shop not found.");
    if (shop.adminUserId === userId) {
      return fail("ALREADY_ADMIN", "This user already administers the shop.");
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, shopId: true, status: true },
    });
    if (!user) return fail("NOT_FOUND", "User not found.");
    if (user.shopId !== shopId) {
      return fail("NOT_A_MEMBER", "That user is not a member of this shop.");
    }
    if (user.status !== "APPROVED") {
      return fail(
        "NOT_A_MEMBER",
        "Only approved members can be made shop admin."
      );
    }

    const previousAdminUserId = shop.adminUserId;
    const swapped = await tx.shop.updateMany({
      where: { id: shopId, adminUserId: previousAdminUserId },
      data: { adminUserId: userId },
    });
    if (swapped.count !== 1) {
      return fail(
        "RACE_LOST",
        "The shop's admin changed while you were editing. Reload and try again."
      );
    }

    const alsoRejected = await tx.shopAdminRequest.updateMany({
      where: { shopId, status: "PENDING" },
      data: {
        status: "REJECTED",
        note: "an admin was assigned directly",
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
      },
    });

    return {
      ok: true as const,
      shopId,
      newAdminUserId: userId,
      previousAdminUserId,
      alsoRejected: alsoRejected.count,
    };
  });
}

// ═══════════════════════════════════════════════════════════════
//  User —— 店铺管理员审本店,平台管理员审任何人
// ═══════════════════════════════════════════════════════════════

export async function reviewUser(
  userId: string,
  action: "approve" | "reject",
  reviewer: Reviewer
): Promise<ReviewResult<{ userId: string; status: "APPROVED" | "REJECTED" }>> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        shopId: true,
        status: true,
        emailVerified: true,
      },
    });
    if (!user) return fail("NOT_FOUND", "User not found.");

    // 越权硬校验: 店铺管理员只能动本店的人。shopId 一律取自会话,
    // 绝不接受客户端传来的值。
    if (reviewer.kind === "user" && user.shopId !== reviewer.shopId) {
      return fail("FORBIDDEN", "This user belongs to another shop.");
    }

    if (user.status !== "PENDING") {
      return fail(
        "ALREADY_HANDLED",
        `This user is already ${user.status.toLowerCase()}.`
      );
    }
    // 只挡批准: 拒绝一个没验证邮箱的注册是完全合理的动作
    if (action === "approve" && !user.emailVerified) {
      return fail(
        "EMAIL_UNVERIFIED",
        "This user hasn't verified their email address yet. They aren't in the review queue."
      );
    }

    const status = action === "approve" ? "APPROVED" : "REJECTED";
    const stamp: Prisma.UserUpdateInput =
      reviewer.kind === "admin"
        ? { approvedByAdmin: { connect: { id: reviewer.id } } }
        : { approvedByUser: { connect: { id: reviewer.id } } };

    await tx.user.update({
      where: { id: user.id },
      // approvedAt 同时充当"处理时间",拒绝也记 —— 用于追责
      data: { status, approvedAt: new Date(), ...stamp },
    });

    return { ok: true as const, userId: user.id, status };
  });
}

/** 结果码 → HTTP 状态 */
export function statusForFailure(code: ReviewFailure): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "ALREADY_HANDLED":
    case "SHOP_HAS_ADMIN":
    case "ALREADY_ADMIN":
    case "RACE_LOST":
      return 409;
    case "NOT_A_MEMBER":
    case "EMAIL_UNVERIFIED":
      return 422;
  }
}
