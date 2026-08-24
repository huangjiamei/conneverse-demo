/**
 * 配送时效格式化 —— 纯函数,没有 "use client",所以服务端组件也能调。
 *
 * 原本长在 components/CandidateCard.tsx 里,但那是个 client 组件,从 server
 * 侧 import 会报 "Attempted to call ... from the server"。抽到这里作为唯一
 * 实现,CandidateCard 再 re-export 出去,老的 import 路径不受影响。
 *
 * ── 基准必须是「搜索当时」,不是「现在」 ──────────────────────────────
 *
 * delivery_min_date / delivery_max_date 是 eBay 在**搜索那一刻**给的绝对日期,
 * 写进 MatchSearch.rawResponse 之后就再也不变了。早先这里拿 Date.now() 当基准
 * 算差值,于是隔一天回头看同一条历史结果,日期已成过去 → 差值为负 → 被
 * Math.max(0, …) 静默压平 → 满屏 "0d"。(实测:库里 78 个有日期的候选,100%
 * 已过期,全部显示 0d。)
 *
 * 现在基准是该次搜索的 MatchSearch.createdAt —— 差值等于「下单当时预计几天到」,
 * 这个数不随时间漂移,历史结果和当初看到的一致。所以 searchedAt 是必填参数:
 * 让 TypeScript 逼着每个调用点都想一遍基准该取哪个,漏传就编译不过。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 显示下限。算出 ≤ 0 天(同日达,或者数据本身就脏)时兜到 1 天 ——
 * "0d" 对店铺没有任何意义,而且极易被读成"到不了/没数据"。
 */
const MIN_DISPLAY_DAYS = 1;

function toMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/** 相对基准的天数,不做任何 clamp —— 兜底放到上层,免得把负数悄悄藏掉 */
function daysFrom(
  iso: string | null | undefined,
  basisMs: number
): number | null {
  const t = toMs(iso);
  if (t == null) return null;
  return Math.round((t - basisMs) / DAY_MS);
}

/**
 * "2d" / "2–4d" / "~3d" / "~1d";两个日期都缺时返回 null(调用方据此整个不渲染)。
 *
 * @param searchedAt 该次搜索的 MatchSearch.createdAt —— 天数相对它算。
 *   传 null 时退回 Date.now(),只适用于"刚刚在本地发起、还没落库"的场景。
 */
export function formatDeliveryRange(
  min: string | null | undefined,
  max: string | null | undefined,
  searchedAt: string | Date | null | undefined
): string | null {
  const basis = toMs(searchedAt) ?? Date.now();

  const rawMn = daysFrom(min, basis);
  const rawMx = daysFrom(max, basis);
  if (rawMn == null && rawMx == null) return null;

  const floor = (n: number) => Math.max(MIN_DISPLAY_DAYS, n);
  const mn = rawMn == null ? null : floor(rawMn);
  const mx = rawMx == null ? null : floor(rawMx);

  if (mn != null && mx != null) {
    if (mn === mx) {
      // 被下限兜住的(原值 ≤ 0)标上 ~,不假装那是个精确估计
      return rawMn! < MIN_DISPLAY_DAYS ? `~${mn}d` : `${mn}d`;
    }
    return `${mn}–${mx}d`;
  }
  // 只有一头有日期 —— 本来就是估算,一律带 ~
  return `~${mn ?? mx}d`;
}
