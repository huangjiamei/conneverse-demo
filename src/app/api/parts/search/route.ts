/**
 * GET /api/parts/search?q=brake&displayCategoryId=2&limit=10
 *
 * PcdbPart 的零件名搜索。给 /search autocomplete 用。
 *   - q                必填, 搜索词
 *   - displayCategoryId 可选, 只搜该显示层一级 (DisplayCategory) 下的 Part
 *   - subCategoryId     可选, 只搜该子类下的 Part
 *   - limit            默认 10 (上限 25)
 *
 * 两段式匹配:
 *   1) 主查询 (精确): 多词 ILIKE '%词%' AND, 排序/结果与原来完全一致 —— 不动。
 *   2) 拼写容错兜底: 仅当主查询命中数 < 5 (疑似拼错) 时才跑。用 word_similarity
 *      的 `<%` 运算符 (走已有的 gin_trgm_ops 索引), 把会话阈值降到 0.3, 只留
 *      word_similarity > 0.3 的, 按相似度降序。
 *   合并: 精确的排最前, 模糊的去重后补在其后, 凑够 limit。
 *
 * 显示层归属 (与浏览树同源):
 *   二级归属走 身份链 SubcategoryDisplayMap → DisplayBucket → DisplayCategory
 *   (与 /api/parts/browse-tree 完全一致), 被"移到别的一级"的二级挂在新一级下。
 *   - displayCategoryId=Y 过滤 → 只出该链下 bucket 属于 Y 的 (cat,sub); 隐藏
 *     (displayBucketId=NULL) 和无桶映射的二级 bdc 为 NULL, 不入整级搜索。
 *   - subCategoryId 过滤 → 精确 (cat,sub) 身份。
 *   - 无 scope 的全局联想 → 维持原类目级隐藏 (类目在 CategoryDisplayMap 可见才出),
 *     且不砍无桶映射的 (cat,sub) 的零件 (它们仍可全局联想到)。
 *   CategoryDisplayMap 只作一级元数据兜底 (无桶映射时给个一级名), 不决定二级归属。
 *   pcdbCategoryId / subCategoryId 仍是原始 PCdb id (eBay 路由 / 落库追踪不变)。
 *
 * 返回: [{ partId, partName, subCategoryId, subCategoryName, pcdbCategoryId,
 *          displayCategoryId, displayCategoryName, bucketName }]
 *   —— subCategoryName / displayCategoryName / bucketName 都走身份链, 和面包屑同源:
 *      下拉小字拼成「一级 › 桶 › 二级短名」, 桶取不到时退回两段。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Row = {
  partId: number;
  partName: string;
  subCategoryId: number;
  subCategoryName: string; // = COALESCE(SubcategoryDisplayMap.displayName, PcdbSubCategory.name)
  pcdbCategoryId: number;
  displayCategoryId: number;
  displayCategoryName: string; // 显示一级 (走身份链 bdc, 兜底 CategoryDisplayMap cdc)
  bucketName: string | null; // DisplayBucket.name (无桶映射/隐藏时为 null)
};

// 精确匹配命中数低于此值 → 疑似拼写错误, 触发 trigram 模糊兜底
const FUZZY_TRIGGER = 5;
// word_similarity 阈值: 只保留相似度高于此值的模糊候选
const FUZZY_THRESHOLD = 0.3;

// 两段查询共用的显示层 join + 选取字段。
// 身份链 (bdc) 与浏览树同源, 决定二级归属; CategoryDisplayMap (cdc) 仅作兜底一级名。
// 一律 LEFT JOIN —— 无桶映射的 (cat,sub) 不被砍, 靠 WHERE 的 scope 条件控制可见性。
const SELECT_AND_JOINS = `
  SELECT
    p.id           AS "partId",
    p.name         AS "partName",
    sc.id          AS "subCategoryId",
    COALESCE(sdm."displayName", sc.name) AS "subCategoryName",
    c.id           AS "pcdbCategoryId",
    COALESCE(bdc.id, cdc.id)     AS "displayCategoryId",
    COALESCE(bdc.name, cdc.name) AS "displayCategoryName",
    db.name        AS "bucketName"
  FROM "PcdbPart" p
  JOIN "PcdbPartCategory" pc  ON pc."partId" = p.id
  JOIN "PcdbCategory" c       ON c.id = pc."categoryId"
  JOIN "PcdbSubCategory" sc   ON sc.id = pc."subCategoryId"
  LEFT JOIN "SubcategoryDisplayMap" sdm
    ON sdm."pcdbCategoryId" = pc."categoryId" AND sdm."pcdbSubCategoryId" = pc."subCategoryId"
  LEFT JOIN "DisplayBucket" db     ON db.id = sdm."displayBucketId"
  LEFT JOIN "DisplayCategory" bdc  ON bdc.id = db."displayCategoryId"
  LEFT JOIN "CategoryDisplayMap" cdm ON cdm."pcdbCategoryId" = c.id
  LEFT JOIN "DisplayCategory" cdc    ON cdc.id = cdm."displayCategoryId"
`;

// scope 过滤 (两段查询共用)。会往 params 里 push, 返回拼进 WHERE 的 AND 子句。
//   displayCategoryId → 整级搜索: 走身份链 bdc (= 浏览树), 隐藏/无桶映射自然排除
//   subCategoryId     → 精确二级身份
//   都没有            → 全局联想: 维持原类目级隐藏 (类目在 CategoryDisplayMap 可见才出)
function buildScopeFilter(
  params: (string | number)[],
  displayCategoryId: number | null,
  subCategoryId: number | null
): string {
  const clauses: string[] = [];
  if (displayCategoryId != null) {
    params.push(displayCategoryId);
    clauses.push(`AND bdc.id = $${params.length}`);
  }
  if (subCategoryId != null) {
    params.push(subCategoryId);
    clauses.push(`AND pc."subCategoryId" = $${params.length}`);
  }
  if (displayCategoryId == null && subCategoryId == null) {
    clauses.push(`AND cdc.id IS NOT NULL`);
  }
  return clauses.join("\n    ");
}

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

  // ── 1) 主查询: 多词 ILIKE 精确匹配 (逻辑与排序保持原样) ──
  const exactRows = await runExactQuery(
    coreTokens,
    corePhrase,
    displayCategoryId,
    subCategoryId,
    limit
  );

  // 命中足够多 → 不是拼错, 原样返回 (精确匹配的准确率完全不受影响)
  if (exactRows.length >= FUZZY_TRIGGER || exactRows.length >= limit) {
    return NextResponse.json(exactRows);
  }

  // ── 2) 拼写容错兜底: trigram word_similarity ──
  const fuzzyRows = await runFuzzyQuery(
    coreTokens,
    displayCategoryId,
    subCategoryId,
    limit
  );

  // 合并: 精确在前, 模糊去重后补齐到 limit
  const seen = new Set(exactRows.map((r) => r.partId));
  const merged: Row[] = [...exactRows];
  for (const r of fuzzyRows) {
    if (merged.length >= limit) break;
    if (seen.has(r.partId)) continue;
    seen.add(r.partId);
    merged.push(r);
  }
  return NextResponse.json(merged);
}

// 主查询 —— 与改动前一字不差: 每个核心词 ILIKE (AND), 启发式排序。
async function runExactQuery(
  coreTokens: string[],
  corePhrase: string,
  displayCategoryId: number | null,
  subCategoryId: number | null,
  limit: number
): Promise<Row[]> {
  const params: (string | number)[] = [];
  const tokenConds = coreTokens.map((t) => {
    params.push(`%${t}%`);
    return `p.name ILIKE $${params.length}`;
  });

  // ORDER BY #1 用的连续核心短语
  params.push(`%${corePhrase}%`);
  const corePhrasePos = params.length;

  const scopeFilter = buildScopeFilter(params, displayCategoryId, subCategoryId);
  params.push(limit);
  const limitPos = params.length;

  const sql = `
    ${SELECT_AND_JOINS}
    WHERE ${tokenConds.join(" AND ")}
    ${scopeFilter}
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
  return prisma.$queryRawUnsafe<Row[]>(sql, ...params);
}

// 模糊兜底 —— trigram word_similarity。用 `<%` 运算符命中 gin_trgm_ops 索引,
// 会话阈值降到 0.3 (SET LOCAL, 在事务内), 多词取各词相似度的最大值。
async function runFuzzyQuery(
  coreTokens: string[],
  displayCategoryId: number | null,
  subCategoryId: number | null,
  limit: number
): Promise<Row[]> {
  const params: (string | number)[] = [];
  const tokenPos = coreTokens.map((t) => {
    params.push(t); // 原始词 (不加 % 通配)
    return params.length;
  });

  // 命中条件: 任一核心词与名字 word-similar (`token <% p.name`, 走索引)
  const matchConds = tokenPos.map((i) => `$${i} <% p.name`).join(" OR ");
  // 相似度分: 多词取最大
  const simExpr =
    tokenPos.length === 1
      ? `word_similarity($${tokenPos[0]}, p.name)`
      : `GREATEST(${tokenPos.map((i) => `word_similarity($${i}, p.name)`).join(", ")})`;

  const scopeFilter = buildScopeFilter(params, displayCategoryId, subCategoryId);

  params.push(FUZZY_THRESHOLD);
  const threshPos = params.length;
  params.push(limit);
  const limitPos = params.length;

  const sql = `
    ${SELECT_AND_JOINS}
    WHERE (${matchConds})
    ${scopeFilter}
      AND ${simExpr} > $${threshPos}
    ORDER BY ${simExpr} DESC, length(p.name), p.name
    LIMIT $${limitPos}
  `;

  // `<%` 用会话变量 pg_trgm.word_similarity_threshold 判定, 默认 0.6 会漏掉
  // 0.3~0.6 的候选 → 在同一事务里 SET LOCAL 到 0.3, 与上面的 > 0.3 过滤一致。
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL pg_trgm.word_similarity_threshold = ${FUZZY_THRESHOLD}`
    );
    return tx.$queryRawUnsafe<Row[]>(sql, ...params);
  });
}
