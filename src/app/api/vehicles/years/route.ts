/**
 * GET /api/vehicles/years
 *
 * 返回全部 VCdb 年份, 新到旧。级联下拉的第一层, 页面加载时预取。
 * 返回: [{ id: 2027 }, { id: 2026 }, ...]
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const years = await prisma.vcdbYear.findMany({
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return NextResponse.json(years);
}
