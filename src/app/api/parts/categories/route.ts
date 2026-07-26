/**
 * GET /api/parts/categories
 *
 * 返回 26 个 Auto Care 大类 (PcdbCategory), 给 /search 页的大类胶囊行用。
 * 返回: [{ id, name }]  按名称排序
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const categories = await prisma.pcdbCategory.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json(categories);
}
