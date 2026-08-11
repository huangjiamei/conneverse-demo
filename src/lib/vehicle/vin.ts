/**
 * VIN 格式校验 —— 前端即时提示和后端入口共用同一份规则。
 *
 * 规则: 17 位, 字符集 [A-HJ-NPR-Z0-9]。I/O/Q 被 ISO 3779 排除 (和 1/0 太像),
 * 出现即视为输入错误而不是罕见车。
 *
 * 这里不做 check digit 校验: 只有北美市场强制第 9 位校验位, 进口车/灰色车
 * 常常算不过, 拦下来会误伤真车 —— 宁可放给 vPIC 去判。
 */

export const VIN_LENGTH = 17;

const VIN_CHARS = /^[A-HJ-NPR-Z0-9]{17}$/;
/** 允许用户粘贴时带空格/连字符/小写 */
const STRIP = /[\s-]/g;

/** 粘贴容错 + 大写。校验前一律先走这个。 */
export function normalizeVin(raw: string): string {
  return raw.replace(STRIP, "").toUpperCase();
}

/**
 * @returns 人话错误信息; null = 合法
 */
export function vinError(vin: string): string | null {
  if (vin.length === 0) return "Enter a VIN.";
  if (vin.length !== VIN_LENGTH) {
    return `A VIN is ${VIN_LENGTH} characters — you entered ${vin.length}.`;
  }
  if (!VIN_CHARS.test(vin)) {
    // 单独点名 I/O/Q, 这是最常见的误输 (多半该打 1/0)
    const bad = [...new Set(vin.split("").filter((c) => !/[A-HJ-NPR-Z0-9]/.test(c)))];
    const iq = bad.filter((c) => "IOQ".includes(c));
    if (iq.length > 0) {
      return `A VIN never contains ${iq.join(", ")} — check for 1 / 0 instead.`;
    }
    return `Invalid character${bad.length > 1 ? "s" : ""}: ${bad.join(", ")}`;
  }
  return null;
}

export function isValidVin(vin: string): boolean {
  return vinError(vin) === null;
}
