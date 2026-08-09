/**
 * GET  /api/shops —— shop list. Public, but the payload depends on the caller.
 * POST /api/shops —— create a shop. Platform admin only.
 *
 * The public shape is exactly what the register dropdown needs (id/name/city/
 * state/hasAdmin) and nothing more; a platform admin additionally gets the
 * contact fields, member counts and pending-request counts for /admin/shops.
 *
 * Shop has no active/soft-delete flag, so every shop is returned. If one is
 * added later, filter it here for the anonymous case.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/auth/liveSession";
import { parseShopFields } from "@/lib/shops";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getLiveSession();
  const isPlatformAdmin = session?.role === "PLATFORM_ADMIN";

  if (!isPlatformAdmin) {
    const shops = await prisma.shop.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true, state: true, adminUserId: true },
    });
    return NextResponse.json(
      shops.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        state: s.state,
        hasAdmin: s.adminUserId !== null,
      }))
    );
  }

  const shops = await prisma.shop.findMany({
    orderBy: { name: "asc" },
    include: {
      adminUser: { select: { id: true, name: true, email: true } },
      _count: {
        select: {
          members: true,
          repairOrders: true,
          adminRequests: { where: { status: "PENDING" } },
        },
      },
    },
  });

  return NextResponse.json(
    shops.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      phone: s.phone,
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2,
      city: s.city,
      state: s.state,
      zip: s.zip,
      country: s.country,
      hasAdmin: s.adminUserId !== null,
      admin: s.adminUser,
      memberCount: s._count.members,
      repairOrderCount: s._count.repairOrders,
      pendingRequestCount: s._count.adminRequests,
    }))
  );
}

export async function POST(req: Request) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { data, errors } = parseShopFields(body, "PLATFORM_ADMIN");

  if (!data.name) {
    errors.name = errors.name ?? "Shop name is required.";
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { error: "Please fix the errors below.", fieldErrors: errors },
      { status: 400 }
    );
  }

  try {
    const shop = await prisma.shop.create({
      // parseShopFields 已保证只含白名单字段,且 name 存在
      data: data as Prisma.ShopUncheckedCreateInput,
      select: { id: true, name: true },
    });
    return NextResponse.json({ ok: true, shop }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: "Please fix the errors below.",
          fieldErrors: { name: "A shop with this name already exists." },
        },
        { status: 409 }
      );
    }
    console.error("[shops:create] failed", err);
    return NextResponse.json(
      { error: "Could not create the shop. Please try again." },
      { status: 500 }
    );
  }
}
