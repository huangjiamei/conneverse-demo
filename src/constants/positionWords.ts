/**
 * 方位词库 + 从用户输入提取方位, 拼到 Part 标准名前。
 *
 * 解决的矛盾:
 *   - 搜 "brake pad" 选 "Disc Brake Pad" → 要标准名 "Disc Brake Pad"
 *   - 搜 "front bumper cover" 选 "Bumper Cover" → 要 "Front Bumper Cover"
 * 解法: 从用户输入抽方位词, titleCase 后拼到标准名前。
 */

// 双词组合放前面 → 优先匹配长的 (extractPositions 从上往下匹配, 长的先占位)
export const POSITION_WORDS = [
  "front left", "front right", "rear left", "rear right",
  "driver side", "passenger side",
  // 单词
  "front", "rear", "left", "right", "upper", "lower",
  "inner", "outer", "center", "driver", "passenger",
  // 缩写
  "lh", "rh", "lt", "rt", "fl", "fr", "rl", "rr",
] as const;

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * 从用户输入按出现顺序提取方位词 (整词匹配, 双词组合优先且不再拆成单词)。
 * "front left door" → ["front left"]; "rear brake" → ["rear"]; "cart" → []。
 */
export function extractPositions(userInput: string): string[] {
  const lower = userInput.toLowerCase();
  const taken = new Array(lower.length).fill(false);
  const matches: { start: number; word: string }[] = [];

  for (const word of POSITION_WORDS) {
    // 整词匹配 (\b 词边界), 组合词中间空白容忍多个空格
    const re = new RegExp(`\\b${word.replace(/\s+/g, "\\s+")}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // 跳过与已匹配区间重叠的 (双词组合已占位时, 里面的单词不再单独匹配)
      let overlap = false;
      for (let i = start; i < end; i++) {
        if (taken[i]) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      matches.push({ start, word });
    }
  }

  // 按在输入中出现的顺序排 ("front left" → Front Left, 不乱序)
  matches.sort((a, b) => a.start - b.start);
  return matches.map((x) => x.word);
}

/**
 * 选中 Part 时算最终描述: 用户输入里的方位 (titleCase) + Part 标准名。
 * 没方位 → 纯标准名。
 */
export function applyPositions(userInput: string, partName: string): string {
  const prefix = extractPositions(userInput).map(titleCase).join(" ");
  return prefix ? `${prefix} ${partName}` : partName;
}
