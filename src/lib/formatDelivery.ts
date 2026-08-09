/**
 * 配送时效格式化 —— 纯函数,没有 "use client",所以服务端组件也能调。
 *
 * 原本长在 components/CandidateCard.tsx 里,但那是个 client 组件,从 server
 * 侧 import 会报 "Attempted to call ... from the server"。抽到这里作为唯一
 * 实现,CandidateCard 再 re-export 出去,老的 import 路径不受影响。
 */

function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const diffMs = d.getTime() - Date.now();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/** "2d" / "2–4d" / "~3d";两个日期都缺时返回 null */
export function formatDeliveryRange(
  min: string | null | undefined,
  max: string | null | undefined
): string | null {
  const mn = daysFromNow(min);
  const mx = daysFromNow(max);
  if (mn == null && mx == null) return null;
  if (mn != null && mx != null) {
    if (mn === mx) return `${mn}d`;
    return `${mn}–${mx}d`;
  }
  return `~${mn ?? mx}d`;
}
