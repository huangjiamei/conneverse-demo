/**
 * POST /api/shop-admin-requests —— body: { note? }
 *
 * 已批准的用户为「自己的店」申请管理员权限。kind 由店铺现状推导,不由客户端指定:
 *   该店无管理员 → CLAIM;已有管理员 → REPLACE。
 * shopId 永远取自会话。
 *
 * 注册时的那条 CLAIM 走的是 /api/auth/register (那时还没有会话),两边规则一致。
 *
 * 建好之后通知平台管理员。注册那条路径不在这里通知 —— 那时申请人还没验证邮箱,
 * 由验证成功后的 notifyEmailVerified 补发,两边靠 emailVerified 分工,不会重复。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/auth/liveSession";
import { notifyShopAdminRequestFiled } from "@/lib/email/notify";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // 平台管理员不属于任何店,没有可申请的对象
  if (session.kind !== "user" || !session.shopId) {
    return NextResponse.json(
      { error: "Only shop members can request admin rights." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { note?: unknown };
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : undefined;

  const shopId = session.shopId;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: { adminUserId: true },
      });
      if (!shop) return { error: "Shop not found.", status: 404 } as const;

      if (shop.adminUserId === session.id) {
        return {
          error: "You are already the admin of this shop.",
          status: 409,
        } as const;
      }

      const existing = await tx.shopAdminRequest.findFirst({
        where: { shopId, userId: session.id, status: "PENDING" },
        select: { id: true },
      });
      if (existing) {
        return {
          error: "You already have a request under review.",
          status: 409,
        } as const;
      }

      const kind = shop.adminUserId === null ? "CLAIM" : "REPLACE";
      const row = await tx.shopAdminRequest.create({
        data: { shopId, userId: session.id, kind, status: "PENDING", note },
        select: { id: true, kind: true },
      });
      return { ok: true, ...row } as const;
    });

    if ("error" in created) {
      return NextResponse.json(
        { error: created.error },
        { status: created.status }
      );
    }

    // 事务已提交才通知 (§D 先落库、后发信)。走到这条路径的人必然是 APPROVED,
    // 也就必然已验证 —— 通知会立刻发出去,不用等任何验证事件。
    // notifyShopAdminRequestFiled 不抛,发信失败不影响申请已经提交成功。
    await notifyShopAdminRequestFiled(created.id);

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[shop-admin-requests] failed", err);
    return NextResponse.json(
      { error: "Could not file the request. Please try again." },
      { status: 500 }
    );
  }
}
