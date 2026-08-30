/**
 * Load the customer-facing result set for one MatchSearch.
 *
 * 唯一的 candidate payload 组装点 —— /results/[id] 页面和 GET /api/results/[id]
 * 都走这里。之前页面自己抄了一份几乎一样的组装逻辑,两份就意味着两个泄露面:
 * 供应商屏蔽只在其中一份生效等于没生效。
 *
 * 可见范围 (searchScope) 和 viewer 裁剪都由 session 决定:
 *   PLATFORM_ADMIN → 内部视角:eBay 链接 / item id / eBay 原价 / 卖家字段都在
 *   其余角色       → 店铺视角:上述字段一律不下发 (不是前端不渲染, 是根本不给)
 *
 * Reuses the stored OptimizerResult rankings for Budget / Rush / Balanced —
 * no matcher or optimizer work happens here.
 */

import { prisma } from "@/lib/prisma";
import type { Candidate, EnrichedFields } from "@/components/CandidateCard";
import { selectUserResults, type HeroBadge } from "@/lib/userResults";
import { searchVisibilityWhere } from "@/lib/searchScope";
import { priceCandidate } from "@/lib/orders/pricing";
import { canPlaceOrder } from "@/lib/orders/scope";
import type { Session } from "@/lib/auth/types";

export type UserHero = { candidate: Candidate; badge: HeroBadge };

export type UserResultsContext = {
  part: string;
  vehicle: string;
  category: string | null;
  partNumber: string | null;
  createdAt: string;
};

/**
 * 与具体候选无关的下单前提 —— 角色对不对、店铺地址全不全。
 * 每张卡片的按钮据此决定禁用与文案;真正的判断在 POST /api/orders 再做一次。
 */
export type OrderingContext = {
  /** 这个角色能不能下单 (平台管理员不能 —— 他们履约) */
  canOrder: boolean;
  /** 店铺收货地址是否完整 (line1 + city + state + zip) */
  addressComplete: boolean;
  /** 不能下单时给店铺看的一句话 */
  blockedReason: string | null;
  /** 只有能自己去补地址的角色 (SHOP_ADMIN) 才给链接;员工给不了就不给死链 */
  fixAddressHref: string | null;
};

export type UserResultsPayload = {
  context: UserResultsContext;
  ordering: OrderingContext;
  heroes: UserHero[];
  alternates: Candidate[];
};

type RawCandidate = {
  item_id?: string;
  compatibility?: Record<string, unknown>;
  optimizer_fields?: EnrichedFields;
  additional_image_urls?: string[];
  part_number_list?: string[];
};

const RANKED_PRESETS = ["Budget", "Rush", "Balanced"] as const;

/** 店铺地址够不够寄件 */
export function isAddressComplete(shop: {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): boolean {
  return !!(shop.addressLine1 && shop.city && shop.state && shop.zip);
}

/**
 * 卖家身份字段 —— 店铺侧一律抹掉。
 * 保留的是「商品事实」:运费、到货、退货、保修、库存、发货国。
 */
function stripSellerFields(ef: EnrichedFields | null): EnrichedFields | null {
  if (!ef) return null;
  const {
    seller_username: _u,
    seller_feedback_pct: _p,
    seller_feedback_count: _c,
    top_rated: _t,
    ...rest
  } = ef;
  return rest;
}

export type CandidateRow = {
  id: string;
  rank: number;
  ebayItemId: string;
  title: string;
  price: unknown;
  currency: string;
  itemUrl: string;
  imageUrl: string | null;
  condition: string | null;
  candidateLabel: number | null;
  labelSource: string | null;
  optimizerRank: number | null;
  optimizerTotal: number | null;
  optimizerPriceScore: number | null;
  optimizerSpeedScore: number | null;
  optimizerQualityScore: number | null;
  optimizerGateReason: string | null;
};

/**
 * DB 行 → 前端候选。**全站唯一的候选下发点** —— 搜索接口、结果接口、结果页
 * 都走这里,`isAdmin` 是供应商屏蔽的唯一执行点。
 *
 * 别在别处手拼 Candidate:少写一个 `isAdmin ?` 就是一条泄露。
 */
export function buildClientCandidate(args: {
  row: CandidateRow;
  brand: string | null;
  enrichedFields: EnrichedFields | null;
  compatibility: Record<string, unknown> | null;
  additionalImageUrls: string[];
  partNumbers: string[];
  pickInPresets: string[];
  isAdmin: boolean;
}): Candidate {
  const { row: c, enrichedFields: ef, isAdmin } = args;

  // 全包价:landed × (1 + markup)。运费未知 → quotedPrice 为 null,
  // 卡片据此标 "Quote needed" 并禁用下单 (B3)。
  const pricing = priceCandidate(Number(c.price), ef?.shipping_cost);

  return {
    id: c.id,
    rank: c.rank,
    title: c.title,
    currency: c.currency,
    imageUrl: c.imageUrl,
    condition: c.condition,
    candidateLabel: c.candidateLabel,
    labelSource: c.labelSource,
    optimizerRank: c.optimizerRank,
    optimizerTotal: c.optimizerTotal,
    optimizerPriceScore: c.optimizerPriceScore,
    optimizerSpeedScore: c.optimizerSpeedScore,
    optimizerQualityScore: c.optimizerQualityScore,
    optimizerGateReason: c.optimizerGateReason,
    brand: args.brand,
    compatibility: args.compatibility,
    additionalImageUrls: args.additionalImageUrls,
    partNumbers: args.partNumbers,
    pickInPresets: args.pickInPresets,

    // 店铺所见即所付
    quotedPrice: pricing.quotedPrice == null ? null : pricing.quotedPrice.toFixed(2),
    quoteBlockedReason: pricing.quoteBlockedReason,

    // ↓ 内部字段:平台管理员才有。店铺侧是 null,不是「前端不渲染」。
    price: isAdmin ? String(c.price) : null,
    landed: isAdmin && pricing.landed != null ? pricing.landed.toFixed(2) : null,
    itemUrl: isAdmin ? c.itemUrl : null,
    // eBay item id 能直接拼出 ebay.com/itm/<id> —— 和链接是同一个泄露
    ebayItemId: isAdmin ? c.ebayItemId : null,
    enrichedFields: isAdmin ? ef : stripSellerFields(ef),
  };
}

/** rawResponse 那条 candidate → buildClientCandidate 的参数 */
function fromRaw(
  c: CandidateRow,
  raw: RawCandidate | undefined,
  pickInPresets: string[],
  isAdmin: boolean
): Candidate {
  const compat = raw?.compatibility || {};
  return buildClientCandidate({
    row: c,
    // 只认真正的 Brand 属性; 不退回 Make —— Make 常是车辆品牌, 会把车厂当成零件品牌。
    brand: (compat.Brand as string) || null,
    enrichedFields: raw?.optimizer_fields ?? null,
    compatibility: (raw?.compatibility as Record<string, unknown>) ?? null,
    additionalImageUrls: raw?.additional_image_urls ?? [],
    partNumbers: raw?.part_number_list ?? [],
    pickInPresets,
    isAdmin,
  });
}

/**
 * @param session 决定可见范围 (searchScope) 和字段裁剪。范围外和不存在一样
 *   都返回 null —— 调用方统一当 404, 不泄露"存在但没权限"。
 * @returns null when the search doesn't exist or is out of scope
 */
export async function loadUserResults(
  matchSearchId: string,
  session: Session
): Promise<UserResultsPayload | null> {
  const isAdmin = session.role === "PLATFORM_ADMIN";

  const search = await prisma.matchSearch.findFirst({
    where: { id: matchSearchId, ...searchVisibilityWhere(session) },
    include: { candidates: { orderBy: { rank: "asc" } } },
  });
  if (!search) return null;

  // 已存的三份排名 (prewarm 都算过) + 用于 pick 徽章的 rank1
  const orRows = await prisma.optimizerResult.findMany({
    where: { matchSearchId, preset: { in: [...RANKED_PRESETS] } },
    select: { candidateId: true, preset: true, rank: true },
  });
  const budgetRank = new Map<string, number | null>();
  const rushRank = new Map<string, number | null>();
  const balRank = new Map<string, number | null>();
  const pickByCand = new Map<string, string[]>();
  for (const r of orRows) {
    const m =
      r.preset === "Budget"
        ? budgetRank
        : r.preset === "Rush"
          ? rushRank
          : r.preset === "Balanced"
            ? balRank
            : null;
    if (m) m.set(r.candidateId, r.rank);
    if (r.rank === 1) {
      const a = pickByCand.get(r.candidateId) ?? [];
      a.push(r.preset);
      pickByCand.set(r.candidateId, a);
    }
  }

  // rawResponse lookup (enrichedFields / brand / compat / part numbers / images)
  const rawByItemId = new Map<string, RawCandidate>();
  if (search.rawResponse) {
    const raw = search.rawResponse as { candidate_info_list?: RawCandidate[] };
    for (const c of raw.candidate_info_list ?? []) {
      if (c.item_id) rawByItemId.set(c.item_id, c);
    }
  }

  const candMap = new Map<string, Candidate>();
  for (const c of search.candidates) {
    candMap.set(
      c.id,
      fromRaw(c, rawByItemId.get(c.ebayItemId), pickByCand.get(c.id) ?? [], isAdmin)
    );
  }

  const verifiedIds = search.candidates
    .filter((c) => c.candidateLabel === 1)
    .map((c) => c.id);

  const { heroes: heroSel, alternateIds } = selectUserResults({
    verifiedIds,
    budgetRankByCand: budgetRank,
    rushRankByCand: rushRank,
    balancedRankByCand: balRank,
  });

  const heroes: UserHero[] = heroSel
    .map((h) => {
      const candidate = candMap.get(h.id);
      return candidate ? { candidate, badge: h.badge } : null;
    })
    .filter((h): h is UserHero => h != null);
  const alternates = alternateIds
    .map((aid) => candMap.get(aid))
    .filter((c): c is Candidate => c != null);

  let category: string | null = null;
  if (search.queryPcdbCategoryId != null) {
    const cat = await prisma.pcdbCategory.findUnique({
      where: { id: search.queryPcdbCategoryId },
      select: { name: true },
    });
    category = cat?.name ?? null;
  }

  return {
    context: {
      part: search.queryPartDescription,
      vehicle: `${search.queryVehicleYear} ${search.queryVehicleMake} ${search.queryVehicleModel}${
        search.queryVehicleSubModel ? ` ${search.queryVehicleSubModel}` : ""
      }`,
      category,
      partNumber: search.queryPartNumber ?? null,
      createdAt: search.createdAt.toISOString(),
    },
    ordering: await loadOrderingContext(session),
    heroes,
    alternates,
  };
}

/**
 * 下单前提。平台管理员直接 canOrder=false —— 他们是履约方,不是买方。
 * 地址不全时的文案按角色分:员工进不了 /shop,给他链接等于给死链。
 */
export async function loadOrderingContext(
  session: Session
): Promise<OrderingContext> {
  if (!canPlaceOrder(session)) {
    return {
      canOrder: false,
      addressComplete: false,
      blockedReason:
        session.role === "PLATFORM_ADMIN"
          ? "Platform admins fulfil orders — they don't place them."
          : "Your account isn't linked to a shop.",
      fixAddressHref: null,
    };
  }

  const shop = await prisma.shop.findUnique({
    where: { id: session.shopId },
    select: { addressLine1: true, city: true, state: true, zip: true },
  });
  const addressComplete = !!shop && isAddressComplete(shop);

  if (addressComplete) {
    return {
      canOrder: true,
      addressComplete: true,
      blockedReason: null,
      fixAddressHref: null,
    };
  }

  const isShopAdmin = session.role === "SHOP_ADMIN";
  return {
    canOrder: false,
    addressComplete: false,
    blockedReason: isShopAdmin
      ? "Add your shop's shipping address before ordering."
      : "Ask your shop admin to complete the shop address.",
    fixAddressHref: isShopAdmin ? "/shop" : null,
  };
}
