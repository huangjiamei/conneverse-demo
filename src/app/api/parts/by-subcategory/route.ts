/**
 * GET /api/parts/by-subcategory?subCategoryId=X&categoryId=Y&q=brake
 *
 * 返回某子类下的所有具体 Part (可再按 categoryId 收窄, 可选 q 名称过滤)。
 * 给 /search 三级浏览的"区域 3"用。
 *
 *   - subCategoryId  必填
 *   - categoryId     可选 (进一步收窄; 一个子类可能跨大类)
 *   - q              可选, part 名 ILIKE 过滤 (辅助搜索框)
 *
 * 返回: [{ partId, partName }]  按名称排序
 *
 * 注: 每个 PcdbPart 在 PcdbPartCategory 里恰好一行, 所以同一子类下不会重复。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const subCategoryId = Number(sp.get("subCategoryId"));
  const categoryIdRaw = sp.get("categoryId");
  const categoryId = categoryIdRaw != null ? Number(categoryIdRaw) : null;
  const q = (sp.get("q") ?? "").trim();

  if (!Number.isInteger(subCategoryId) || subCategoryId <= 0) {
    return NextResponse.json(
      { error: "Query must include a valid ?subCategoryId=<int>" },
      { status: 400 }
    );
  }
  if (categoryId != null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
    return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
  }

  const where: Prisma.PcdbPartCategoryWhereInput = { subCategoryId };
  if (categoryId != null) where.categoryId = categoryId;
  if (q) where.part = { name: { contains: q, mode: "insensitive" } };

  const rows = await prisma.pcdbPartCategory.findMany({
    where,
    select: { part: { select: { id: true, name: true } } },
    orderBy: { part: { name: "asc" } },
  });

  return NextResponse.json(
    rows.map((r) => ({ partId: r.part.id, partName: r.part.name }))
  );
}
