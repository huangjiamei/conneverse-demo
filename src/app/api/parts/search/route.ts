/**
 * GET /api/parts/search?q=brake&displayCategoryId=2&limit=10
 *
 * PcdbPart 的 fuzzy 搜索 (pg_trgm)。给 /search autocomplete 用。
 *   - q                必填, 搜索词
 *   - displayCategoryId 可选, 只搜该显示层一级 (DisplayCategory) 下的 Part
 *   - subCategoryId     可选, 只搜该子类下的 Part
 *   - limit            默认 10 (上限 25)
 *
 * 显示层映射 (与一级下拉同源):
 *   结果经 CategoryDisplayMap 内连 DisplayCategory —— displayCategoryId=NULL 的
 *   隐藏一级 (18/23/29/44/45) 自然被 INNER JOIN 剔除。所以只挂在隐藏一级下的零件
 *   (如 "Brake Lathe" 只在 18 下) 不会出现在结果里; 结果行的一级名显示的是
 *   DisplayCategory 名 (如 "Brakes"), 不是 PcdbCategory 原名。一个零件若同时有
 *   可见和隐藏的家, 只留可见的那行 (JOIN 天然过滤)。
 *
 * 排序: 连续核心短语优先, 小配件降权, 短名优先, 再按名称。
 * 返回: [{ partId, partName, subCategoryId, subCategoryName,
 *          pcdbCategoryId, displayCategoryId, displayCategoryName }]
 *   - pcdbCategoryId / subCategoryId 是原始 PCdb id: 选中后查 eBay / 落库追踪用,
 *     不受显示层改名合并影响 (搜索匹配逻辑不变)。
 *
 * 注: 现数据里每个 PcdbPart 在 PcdbPartCategory 里恰好一行, join 后一个可见家一行。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Row = {
  partId: number;
  partName: string;
  subCategoryId: number;
  subCategoryName: string;
  pcdbCategoryId: number;
  displayCategoryId: number;
  displayCategoryName: string;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const displayCategoryIdRaw = sp.get("displayCategoryId");
  const displayCategoryId =
    displayCategoryIdRaw != null ? Number(displayCategoryIdRaw) : null;
  const subCategoryIdRaw = sp.get("subCategoryId");
  const subCategoryId = subCategoryIdRaw != null ? Number(subCategoryIdRaw) : null;
  const limit = Math.min(25, Math.max(1, Number(sp.get("limit")) || 10));

  if (!q) return NextResponse.json([]);
  if (
    displayCategoryId != null &&
    (!Number.isInteger(displayCategoryId) || displayCategoryId <= 0)
  ) {
    return NextResponse.json({ error: "Invalid displayCategoryId" }, { status: 400 });
  }
  if (subCategoryId != null && (!Number.isInteger(subCategoryId) || subCategoryId <= 0)) {
    return NextResponse.json({ error: "Invalid subCategoryId" }, { status: 400 });
  }

  // 方位词: 仅用于提取核心短语, 不参与匹配
  const DIRECTIONAL = new Set([
    "front", "rear", "left", "right", "upper", "lower", "inner", "outer",
    "center", "driver", "passenger", "lh", "rh", "lt", "rt",
  ]);

  // 拆词 → 去方位词得核心词。核心词全被过滤掉时 (查询全是方位词), 退回全部词。
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  let coreTokens = tokens.filter((t) => !DIRECTIONAL.has(t));
  if (coreTokens.length === 0) coreTokens = tokens;
  const corePhrase = coreTokens.join(" ");

  // 匹配: 每个核心词 ILIKE (AND), 宽松但要求核心词都在
  const params: (string | number)[] = [];
  const tokenConds = coreTokens.map((t) => {
    params.push(`%${t}%`);
    return `p.name ILIKE $${params.length}`;
  });

  // ORDER BY #1 用的连续核心短语
  params.push(`%${corePhrase}%`);
  const corePhrasePos = params.length;

  // 显示层一级过滤 (dc.id)。隐藏一级不在 DisplayCategory 里, 传了也自然搜不到。
  let displayCategoryFilter = "";
  if (displayCategoryId != null) {
    params.push(displayCategoryId);
    displayCategoryFilter = `AND dc.id = $${params.length}`;
  }
  let subCategoryFilter = "";
  if (subCategoryId != null) {
    params.push(subCategoryId);
    subCategoryFilter = `AND pc."subCategoryId" = $${params.length}`;
  }
  params.push(limit);
  const limitPos = params.length;

  const sql = `
    SELECT
      p.id           AS "partId",
      p.name         AS "partName",
      sc.id          AS "subCategoryId",
      sc.name        AS "subCategoryName",
      c.id           AS "pcdbCategoryId",
      dc.id          AS "displayCategoryId",
      dc.name        AS "displayCategoryName"
    FROM "PcdbPart" p
    JOIN "PcdbPartCategory" pc  ON pc."partId" = p.id
    JOIN "PcdbCategory" c       ON c.id = pc."categoryId"
    JOIN "PcdbSubCategory" sc   ON sc.id = pc."subCategoryId"
    -- 内连显示层映射: displayCategoryId=NULL (隐藏) 的家在此被剔除
    JOIN "CategoryDisplayMap" cdm ON cdm."pcdbCategoryId" = c.id
    JOIN "DisplayCategory" dc     ON dc.id = cdm."displayCategoryId"
    WHERE ${tokenConds.join(" AND ")}
    ${displayCategoryFilter}
    ${subCategoryFilter}
    ORDER BY
      -- 1. 连续核心短语匹配优先 (本体 "Bumper Cover" 在 "... Cover Nut" 之前)
      CASE WHEN p.name ILIKE $${corePhrasePos} THEN 0 ELSE 1 END,
      -- 2. 小配件词降权
      CASE WHEN p.name ~* '\\y(nut|bolt|screw|clip|cap|stud|stay|stop|bracket|retainer|grommet|washer|pin|rivet|spacer|seal)\\y' THEN 1 ELSE 0 END,
      -- 3. 短名优先
      length(p.name),
      p.name
    LIMIT $${limitPos}
  `;

  const rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...params);
  return NextResponse.json(rows);
}
