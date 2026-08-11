/**
 * 品牌名归一化 —— 把外部来源的 make 文本对到 VCdb 的 MakeName。
 *
 * 外部来源目前有两个, 拼写习惯都和 VCdb 不一样:
 *   - VIN 解码 (vPIC): 全大写, 偶尔带集团后缀 ("BMW OF NORTH AMERICA, LLC")
 *   - CCC 工单导入 (src/lib/import-ro.ts): 修理厂手打, 大量简写 ("CHEVY")
 * 两边共用这一份表, 别再各写一套。
 *
 * 做法分两步:
 *   1. makeKey(): 去掉大小写/空格/标点差异 —— "Mercedes-Benz" 和
 *      "MERCEDES BENZ" 落到同一个 key。绝大多数情况这一步就够了。
 *   2. MAKE_ALIASES: 只兜 key 也对不上的特例 (简写、集团名、旧称)。
 */

/**
 * 归一化到可比较的 key: 只留 A-Z0-9。
 * "Mercedes-Benz" / "MERCEDES BENZ" / "mercedes_benz" → "MERCEDESBENZ"
 */
export function makeKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * key → VCdb MakeName 的特例表。左边写 makeKey() 之后的形式。
 * 右边是 VCdb 里的写法, 但下游仍然按 key 比对, 所以右边大小写随意。
 */
export const MAKE_ALIASES: Record<string, string> = {
  // 口语简写。注意 "MERC" 不收: Mercedes 和 Mercury 都这么简写, 猜错不如不猜。
  CHEVY: "Chevrolet",
  CHEV: "Chevrolet",
  VW: "Volkswagen",
  BENZ: "Mercedes-Benz",
  BEEMER: "BMW",
  BIMMER: "BMW",
  CADDY: "Cadillac",
  OLDS: "Oldsmobile",
  // 法人名 (vPIC 的 Make 偶尔返回这类)。"General Motors" 不收 —— 它下面
  // 有 Chevrolet/GMC/Cadillac/Buick 四个 make, 映到任何一个都是瞎猜。
  MERCEDESBENZUSA: "Mercedes-Benz",
  BMWOFNORTHAMERICA: "BMW",
  AMERICANHONDAMOTOR: "Honda",
  // 拼写变体
  GMCTRUCK: "GMC",
  LANDROVER: "Land Rover",
  ALFA: "Alfa Romeo",
  ALFAROMEO: "Alfa Romeo",
  ROLLSROYCE: "Rolls-Royce",
  ASTONMARTIN: "Aston Martin",
  MINICOOPER: "MINI",
  RAMTRUCKS: "Ram",
};

/** 会被剥掉的法人/集团后缀 —— 别名表兜不住的长尾走这里 */
const CORPORATE_SUFFIXES = [
  "MOTORCOMPANY",
  "MOTORCORPORATION",
  "MOTORSCORPORATION",
  "MANUFACTURING",
  "NORTHAMERICA",
  "USA",
  "LLC",
  "INC",
  "CORP",
  "CORPORATION",
  "COMPANY",
  "LTD",
  "GMBH",
  "AG",
];

/**
 * 外部 make 文本 → 用于和 VCdb 比对的 key。
 * 别名命中优先; 否则剥掉集团后缀 (剥完为空就退回原 key)。
 */
export function normalizedMakeKey(raw: string): string {
  const key = makeKey(raw);
  const alias = MAKE_ALIASES[key];
  if (alias) return makeKey(alias);

  let stripped = key;
  for (const suffix of CORPORATE_SUFFIXES) {
    if (stripped.length > suffix.length && stripped.endsWith(suffix)) {
      stripped = stripped.slice(0, -suffix.length);
      // 剥完可能露出下一层 (…MOTORCOMPANYLLC), 所以不 break, 继续扫
    }
  }
  // 剥空了说明整串都是后缀词, 那还是拿原始 key 去碰运气
  return stripped.length > 0 ? stripped : key;
}

/**
 * 在一组 VCdb make 里找匹配项。
 * @param candidates 该年份下的 VcdbMake 行
 * @returns 命中的行; 没命中返回 null (交给用户手选, 不硬猜)
 */
export function matchMake<T extends { name: string }>(
  rawMake: string,
  candidates: T[]
): T | null {
  const target = normalizedMakeKey(rawMake);
  if (!target) return null;
  return candidates.find((c) => normalizedMakeKey(c.name) === target) ?? null;
}
