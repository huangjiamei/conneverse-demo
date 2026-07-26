/**
 * GET /api/parts/subcategories?categoryId=3
 *
 * 返回某大类下的所有子类 (经 PcdbPartCategory 反查, 去重)。
 * 给 /search 三级浏览的"区域 2"用。
 * 返回: [{ subCategoryId, subCategoryName }]  按名称排序
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const categoryId = Number(new URL(req.url).searchParams.get("categoryId"));
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json(
      { error: "Query must include a valid ?categoryId=<int>" },
      { status: 400 }
    );
  }

  const rows = await prisma.pcdbPartCategory.findMany({
    where: { categoryId },
    distinct: ["subCategoryId"],
    select: { subCategory: { select: { id: true, name: true } } },
    orderBy: { subCategory: { name: "asc" } },
  });

  return NextResponse.json(
    rows.map((r) => ({
      subCategoryId: r.subCategory.id,
      subCategoryName: r.subCategory.name,
    }))
  );
}
