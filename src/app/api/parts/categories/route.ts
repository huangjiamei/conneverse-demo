/**
 * GET /api/parts/categories
 *
 * 返回浏览用的一级目录 —— 读 DisplayCategory 映射层, 不再直接读 PcdbCategory。
 *   - 只出经 CategoryDisplayMap 映射进来的 (displayCategoryId 非空);
 *     隐藏的 pcdbCategory (displayCategoryId=NULL) 不产生任何 DisplayCategory 行;
 *   - 按 sortOrder 排序;
 *   - 合并: 多个 pcdbCategory 指向同一 DisplayCategory 时, 一级只出现一次,
 *     其成员 pcdbCategoryId 全带在 pcdbCategoryIds 里 (前端据此取二级/零件的并集,
 *     并在搜索/追踪时回落到真实的 PcdbCategory.id)。
 *
 * 返回: [{ id, name, pcdbCategoryIds }]  id = DisplayCategory.id
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rows = await prisma.displayCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      categoryMaps: { select: { pcdbCategoryId: true } },
    },
  });

  // 没有任何成员 pcdbCategory 的显示一级不出 (菜单点进去也是空的)
  const categories = rows
    .map((d) => ({
      id: d.id,
      name: d.name,
      pcdbCategoryIds: d.categoryMaps.map((m) => m.pcdbCategoryId),
    }))
    .filter((d) => d.pcdbCategoryIds.length > 0);

  return NextResponse.json(categories);
}
