/**
 * GET /api/parts/search?q=brake&categoryId=3&limit=10
 *
 * PcdbPart 的 fuzzy 搜索 (pg_trgm)。给 /search autocomplete 用。
 *   - q         必填, 搜索词
 *   - categoryId 可选, 只搜该大类下的 Part
 *   - limit     默认 10 (上限 25)
 *
 * 排序: similarity(name, q) DESC (trgm 相似度), 同分按名称。
 * 返回: [{ partId, partName, subCategoryId, subCategoryName, categoryId, categoryName }]
 *
 * 注: 每个 PcdbPart 在 PcdbPartCategory 里恰好一行 (40464=40464), 所以 join
 * 后一个 part 一行, 不需要额外去重。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Row = {
  partId: number;
  partName: string;
  subCategoryId: number;
  subCategoryName: string;
  categoryId: number;
  categoryName: string;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const categoryIdRaw = sp.get("categoryId");
  const categoryId = categoryIdRaw != null ? Number(categoryIdRaw) : null;
  const subCategoryIdRaw = sp.get("subCategoryId");
  const subCategoryId = subCategoryIdRaw != null ? Number(subCategoryIdRaw) : null;
  const limit = Math.min(25, Math.max(1, Number(sp.get("limit")) || 10));

  if (!q) return NextResponse.json([]);
  if (categoryId != null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
    return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
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

  let categoryFilter = "";
  if (categoryId != null) {
    params.push(categoryId);
    categoryFilter = `AND pc."categoryId" = $${params.length}`;
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
      c.id           AS "categoryId",
      c.name         AS "categoryName"
    FROM "PcdbPart" p
    JOIN "PcdbPartCategory" pc ON pc."partId" = p.id
    JOIN "PcdbCategory" c      ON c.id = pc."categoryId"
    JOIN "PcdbSubCategory" sc  ON sc.id = pc."subCategoryId"
    WHERE ${tokenConds.join(" AND ")}
    ${categoryFilter}
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
