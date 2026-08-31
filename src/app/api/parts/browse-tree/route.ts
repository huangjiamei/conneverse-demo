/**
 * GET /api/parts/browse-tree
 *
 * 商品浏览的三层树 (显示层, 与 PCdb 原始分类解耦):
 *   L1  DisplayCategory        —— 17 个显示一级, 按 sortOrder
 *   L2  DisplayBucket          —— 该一级下的展示桶, 按 sortOrder
 *   L3  SubcategoryDisplayMap  —— 该桶下的 (pcdbCategoryId, pcdbSubCategoryId) 身份,
 *                                 按 sortOrder; 二级显示名 = COALESCE(displayName,
 *                                 PcdbSubCategory.name) —— 优先取映射表里手工改名
 *
 * 二级归属一律走 SubcategoryDisplayMap → DisplayBucket → DisplayCategory 这条链。
 * displayBucketId = NULL 的二级 = 隐藏, 不挂在任何桶下, 自然不出现在树里。
 * CategoryDisplayMap 只作 L1 元数据, 不参与二级归属。
 *
 * eBay 路由不变: L3 携带原始 (pcdbCategoryId, pcdbSubCategoryId), 选中后照旧传给搜索。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const cats = await prisma.displayCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      buckets: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          subcategoryMaps: {
            orderBy: { sortOrder: "asc" },
            select: {
              pcdbCategoryId: true,
              pcdbSubCategoryId: true,
              displayName: true,
            },
          },
        },
      },
    },
  });

  // 二级名不在映射表里 —— 批量 join PcdbSubCategory 一次拿全
  const subIds = Array.from(
    new Set(
      cats.flatMap((c) =>
        c.buckets.flatMap((b) => b.subcategoryMaps.map((s) => s.pcdbSubCategoryId))
      )
    )
  );
  const names = subIds.length
    ? await prisma.pcdbSubCategory.findMany({
        where: { id: { in: subIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));

  const tree = cats.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    buckets: c.buckets.map((b) => ({
      id: b.id,
      name: b.name,
      subcategories: b.subcategoryMaps.map((s) => ({
        pcdbCategoryId: s.pcdbCategoryId,
        pcdbSubCategoryId: s.pcdbSubCategoryId,
        // 显示名: 优先 SubcategoryDisplayMap.displayName, 空则回退 PcdbSubCategory.name
        name:
          s.displayName ?? nameById.get(s.pcdbSubCategoryId) ?? `#${s.pcdbSubCategoryId}`,
      })),
    })),
  }));

  return NextResponse.json(tree);
}
