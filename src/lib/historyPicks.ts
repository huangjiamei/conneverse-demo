/**
 * Rank-1 picks for the Search History list, per preset.
 *
 * Everything here is read back from what the search already stored — the
 * OptimizerResult rows (all 4 presets are written on every search) plus the
 * matcher payload in MatchSearch.rawResponse. Nothing is recomputed and the
 * schema is untouched.
 *
 * Why the raw query: brand, shipping cost and delivery dates only exist inside
 * rawResponse (Candidate has price but no shipping). Those blobs average ~9 KB,
 * so pulling them whole for a 200-row page would move megabytes. Instead we let
 * Postgres expand the jsonb array and hand back just the few fields we show,
 * for just the handful of item ids that actually won a preset.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDeliveryRange } from "@/lib/formatDelivery";

/** 一个格子要显示的东西 */
export type PickCell = {
  /** brand 优先, 没有就用截短的标题 */
  label: string;
  /** 到手价 (含运费), 已格式化 */
  price: string;
  /** 运费未知时的提醒; 已含运费则为 null */
  priceNote: string | null;
  /** "2–4d", 只有 Fastest 用 */
  delivery: string | null;
  /** optimizer 总分, 只给平台管理员 */
  score: number | null;
};

export type PresetPicks = Map<string, PickCell>;

type RawFields = {
  brand: string | null;
  shippingCost: string | null;
  deliveryMin: string | null;
  deliveryMax: string | null;
  /** 该次搜索的时间 —— 到货天数相对它算,不能用「现在」 */
  searchedAt: Date | null;
};

function shortTitle(title: string, n = 42): string {
  return title.length > n ? title.slice(0, n).trimEnd() + "…" : title;
}

/** 与结果卡一致: brand 有效就用 brand, 否则退回截短标题 */
function labelFor(title: string, brand: string | null): string {
  const b = brand?.trim();
  if (b && b.toLowerCase() !== "unbranded") return b;
  return shortTitle(title);
}

/**
 * 读某个 preset 的 rank-1。
 *
 * @param withDelivery Fastest 列才需要配送时效
 * @param withScore    只有平台管理员看得到分数 (§7: 分数不进普通用户界面)
 */
export async function loadPresetPicks(
  matchSearchIds: string[],
  preset: string,
  opts: { withDelivery?: boolean; withScore?: boolean } = {}
): Promise<PresetPicks> {
  const out: PresetPicks = new Map();
  if (matchSearchIds.length === 0) return out;

  const winners = await prisma.optimizerResult.findMany({
    where: { matchSearchId: { in: matchSearchIds }, preset, rank: 1 },
    select: {
      matchSearchId: true,
      total: true,
      candidate: { select: { title: true, price: true, ebayItemId: true } },
    },
  });
  if (winners.length === 0) return out;

  // 只把这批赢家的 item_id 从 rawResponse 里挑出来
  const itemIds = [...new Set(winners.map((w) => w.candidate.ebayItemId))];
  const rows = await prisma.$queryRaw<
    Array<{ matchSearchId: string; itemId: string } & RawFields>
  >`
    SELECT ms.id                                            AS "matchSearchId",
           ms."createdAt"                                   AS "searchedAt",
           elem->>'item_id'                                 AS "itemId",
           COALESCE(elem->'compatibility'->>'Brand',
                    elem->'compatibility'->>'Make')         AS "brand",
           elem->'optimizer_fields'->>'shipping_cost'       AS "shippingCost",
           elem->'optimizer_fields'->>'delivery_min_date'   AS "deliveryMin",
           elem->'optimizer_fields'->>'delivery_max_date'   AS "deliveryMax"
    FROM "MatchSearch" ms,
         LATERAL jsonb_array_elements(ms."rawResponse"->'candidate_info_list') elem
    WHERE ms.id IN (${Prisma.join(matchSearchIds)})
      AND elem->>'item_id' IN (${Prisma.join(itemIds)})
  `;
  const rawByKey = new Map(
    rows.map((r) => [`${r.matchSearchId}:${r.itemId}`, r])
  );

  for (const w of winners) {
    const raw = rawByKey.get(`${w.matchSearchId}:${w.candidate.ebayItemId}`);
    const price = Number(w.candidate.price);
    const shipRaw = raw?.shippingCost;
    const ship =
      shipRaw == null || String(shipRaw).trim() === "" ? null : Number(shipRaw);
    const shipKnown = ship != null && !Number.isNaN(ship);

    out.set(w.matchSearchId, {
      label: labelFor(w.candidate.title, raw?.brand ?? null),
      price: `$${(price + (shipKnown ? ship : 0)).toFixed(2)}`,
      priceNote: shipKnown ? null : "+ shipping",
      delivery: opts.withDelivery
        ? formatDeliveryRange(
            raw?.deliveryMin,
            raw?.deliveryMax,
            raw?.searchedAt ?? null
          )
        : null,
      score: opts.withScore && w.total != null ? Math.round(w.total) : null,
    });
  }

  return out;
}
