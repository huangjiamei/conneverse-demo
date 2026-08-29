/**
 * GET /api/parts/subcategories?categoryIds=15,16   (也兼容旧的 ?categoryId=3)
 *
 * 返回一组 pcdbCategory 下的所有子类 (经 PcdbPartCategory 反查, 跨这些大类去重)。
 * 显示一级现在是 DisplayCategory, 一个显示一级可合并多个 pcdbCategory, 所以这里
 * 收一组 categoryId, 返回它们二级的并集 —— 给 /search 菜单的"区域 2"用。
 *
 * 返回: [{ subCategoryId, subCategoryName }]  按名称排序
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCategoryIds } from "@/lib/parts/categoryIds";

export async function GET(req: Request) {
  const ids = parseCategoryIds(new URL(req.url).searchParams);
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Query must include ?categoryIds=<int,int,...> (or ?categoryId=<int>)" },
      { status: 400 }
    );
  }

  const rows = await prisma.pcdbPartCategory.findMany({
    where: { categoryId: { in: ids } },
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
