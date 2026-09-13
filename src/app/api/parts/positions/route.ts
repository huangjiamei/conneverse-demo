/**
 * GET /api/parts/positions?partId=1684
 *
 * 返回该件型 (PcdbPart / PartTerminologyID) 的**合法方向性位置**, 供前端在选到具体件后
 * 弹结构化位置选择器 (多选)。数据来自构建时预算的 src/data/part-positions.json
 * (scripts/build-part-positions.ts), **运行时零 DB**。
 *
 * 只有方向性位置的件型才在表里; 只有 "N/A" / 无位置的件型不在 → 返回空数组 → 前端不弹选择器。
 *
 * 返回: { positions: string[] }   (如 { positions: ["Front","Rear","Front Left",...] })
 */

import { NextResponse } from "next/server";
import partPositions from "@/data/part-positions.json";

const MAP = partPositions as Record<string, string[]>;

export async function GET(req: Request) {
  const partId = Number(new URL(req.url).searchParams.get("partId"));
  if (!Number.isInteger(partId) || partId <= 0) {
    return NextResponse.json({ error: "Query must include ?partId=<int>" }, { status: 400 });
  }
  // 不在表里 = 该件型没有方向性位置 (只 N/A / 未收) → 空数组, 前端据此不显选择器
  return NextResponse.json({ positions: MAP[String(partId)] ?? [] });
}
