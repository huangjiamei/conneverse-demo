/**
 * 解析一级目录过滤用的 pcdbCategory id 组。
 *
 * 显示一级 (DisplayCategory) 可合并多个 pcdbCategory, 所以浏览接口收一组 id:
 *   - 新: ?categoryIds=15,16
 *   - 旧: ?categoryId=3   (单个, 向后兼容)
 * 去重、去非法值, 返回正整数数组 (可能为空)。
 */
export function parseCategoryIds(sp: URLSearchParams): number[] {
  const raw = sp.get("categoryIds");
  const parts =
    raw != null
      ? raw.split(",")
      : sp.get("categoryId") != null
        ? [sp.get("categoryId")!]
        : [];
  const ids = parts
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return Array.from(new Set(ids));
}
