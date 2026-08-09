/**
 * PATCH  /api/shops/[id] —— edit a shop. Fields allowed depend on the role.
 * DELETE /api/shops/[id] —— platform admin only, refused if the shop is in use.
 *
 * §5 field rules live in lib/shops.ts:
 *   SHOP_ADMIN     → contact/address/type, and only on the shop they run
 *   PLATFORM_ADMIN → all of the above plus `name`
 * Anything else in the body is dropped, not applied — the response reports what
 * was ignored so a mistaken caller isn't left thinking it worked.
 *
 * Ownership comes from Shop.adminUserId (the single source of truth), never
 * from a shopId in the request body.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/auth/liveSession";
import { parseShopFields } from "@/lib/shops";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  let role: "PLATFORM_ADMIN" | "SHOP_ADMIN";
  if (session.role === "PLATFORM_ADMIN") {
    role = "PLATFORM_ADMIN";
  } else if (session.role === "SHOP_ADMIN") {
    // 只能改自己管的那家店
    const owned = await prisma.shop.findFirst({
      where: { id, adminUserId: session.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json(
        { error: "You can only edit the shop you administer." },
        { status: 403 }
      );
    }
    role = "SHOP_ADMIN";
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { data, errors, ignored } = parseShopFields(body, role);

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { error: "Please fix the errors below.", fieldErrors: errors },
      { status: 400 }
    );
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update.", ignored },
      { status: 400 }
    );
  }

  try {
    const shop = await prisma.shop.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        type: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        zip: true,
        country: true,
      },
    });
    // ignored 回给调用方: 店铺管理员传了 name/adminUserId 时能看到它没被应用
    return NextResponse.json({ ok: true, shop, ignored });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json(
          {
            error: "Please fix the errors below.",
            fieldErrors: { name: "A shop with this name already exists." },
          },
          { status: 409 }
        );
      }
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Shop not found." }, { status: 404 });
      }
    }
    console.error("[shops:update] failed", err);
    return NextResponse.json(
      { error: "Could not save the shop. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const shop = await prisma.shop.findUnique({
    where: { id },
    select: {
      name: true,
      _count: { select: { members: true, repairOrders: true } },
    },
  });
  if (!shop) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  // User.shopId 和 RepairOrder.shopId 都是 RESTRICT。先自己查一次给出人话,
  // 免得让用户面对一个 500 或裸的外键错误。
  const blockers: string[] = [];
  if (shop._count.members > 0) {
    blockers.push(
      `${shop._count.members} member${shop._count.members === 1 ? "" : "s"}`
    );
  }
  if (shop._count.repairOrders > 0) {
    blockers.push(
      `${shop._count.repairOrders} repair order${shop._count.repairOrders === 1 ? "" : "s"}`
    );
  }
  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: `${shop.name} still has ${blockers.join(" and ")}. Move or remove them before deleting the shop.`,
        code: "SHOP_IN_USE",
      },
      { status: 409 }
    );
  }

  try {
    // 申请记录只指向本店,随店一起清掉
    await prisma.$transaction(async (tx) => {
      await tx.shopAdminRequest.deleteMany({ where: { shopId: id } });
      await tx.shop.delete({ where: { id } });
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // 查询和删除之间有人加了成员/工单 —— 外键在这里兜底
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return NextResponse.json(
        {
          error: `${shop.name} is still referenced by other records and can't be deleted.`,
          code: "SHOP_IN_USE",
        },
        { status: 409 }
      );
    }
    console.error("[shops:delete] failed", err);
    return NextResponse.json(
      { error: "Could not delete the shop. Please try again." },
      { status: 500 }
    );
  }
}
