/**
 * 一件 candidate 的定价与「能不能即时下单」—— 全站唯一实现。
 *
 * 三个价的关系:
 *   price        eBay 标价 (Candidate.price)          —— 内部
 *   landed       price + shipping                     —— 内部, optimizer 排序按它
 *   quotedPrice  landed × (1 + ORDER_MARKUP), 分位四舍五入 —— 店铺看到并支付的全包价
 *
 * 为什么只在服务端算:店铺「所见即所付」,那么下单时收多少就必须和卡片上印的
 * 是同一个数。以前 landed 是在浏览器里拼的 (UserResults 的 cardPrice/rowPrice),
 * 一旦下单接口自己再算一遍,两份实现就会漂移。现在卡片显示的 quotedPrice 和
 * POST /api/orders 重算的 quotedPrice 都出自这里。
 *
 * markup 对所有候选一致,所以不影响 optimizer 的相对排序 —— 排序仍按 landed。
 */

import { Prisma } from "@prisma/client";

/** 店铺加价率。默认 0;上线前至少要盖住 ~3% 的 Stripe 手续费。 */
export function orderMarkup(): number {
  const raw = process.env.ORDER_MARKUP;
  if (raw == null || raw.trim() === "") return 0;
  const n = Number(raw);
  // 配错了当没配 —— 宁可少赚也不要把随机数字收给店铺
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * 传给 matcher 的收货 zip。放在定价这里是因为它就是定价链条的第一环:
 * zip → eBay 按收货地报的真实运费 → landed → quotedPrice。
 * 拿不到合法 5 位 zip 就返回 null,matcher 那边不加 header,退回笼统运费。
 */
export function normalizeDeliveryZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const t = zip.trim();
  // 只接受美国 5 位 (ZIP+4 取前 5 段);其它一律不传, 免得 eBay 拿到脏值
  const m = /^(\d{5})(?:-\d{4})?$/.exec(t);
  return m ? m[1] : null;
}

/** 运费:拿不到就是 null (缺失 / freight / calculated 带 zip 仍无值) */
export function parseShippingCost(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** landed = price + shipping。运费未知 → null (不是「按 0 算」)。 */
export function landedCost(
  price: number,
  shippingCost: number | null
): number | null {
  if (!Number.isFinite(price) || price < 0) return null;
  if (shippingCost == null) return null;
  return price + shippingCost;
}

/** 四舍五入到分。Number 的浮点误差在这一步收干净。 */
export function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * 店铺付的单价。landed 算不出 → null,调用方据此禁用下单 (见 orderability)。
 */
export function quotedUnitPrice(landed: number | null): number | null {
  if (landed == null) return null;
  return roundToCents(landed * (1 + orderMarkup()));
}

/** 订单总额 = 单价 × 数量,同样落到分。 */
export function orderTotal(unitPrice: number, quantity: number): number {
  return roundToCents(unitPrice * quantity);
}

/** Decimal(10,2) 入库前的统一转换 —— 别把 JS number 直接塞给 Prisma。 */
export function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

/** Prisma.Decimal → JSON 安全的字符串 (Decimal 不能直接进 NextResponse.json) */
export function decimalToString(
  value: Prisma.Decimal | null | undefined
): string | null {
  return value == null ? null : value.toString();
}

/**
 * 一件候选的定价结论。`quotedPrice == null` 就是 B3 说的「运费未知」:
 * 给不出可信全包价 → 不能提前一次收清 → 不给即时下单。
 */
export type CandidatePricing = {
  /** 店铺看到并支付的单价;null = 无法报价 */
  quotedPrice: number | null;
  /** 内部:landed,只给平台管理员视图 */
  landed: number | null;
  /** 内部:运费 */
  shippingCost: number | null;
  /** 无法即时下单时的原因文案 (店铺可见) */
  quoteBlockedReason: string | null;
};

export const QUOTE_NEEDED_LABEL = "Quote needed — not available for instant order";

export function priceCandidate(
  price: number,
  rawShippingCost: unknown
): CandidatePricing {
  const shippingCost = parseShippingCost(rawShippingCost);
  const landed = landedCost(price, shippingCost);
  const quotedPrice = quotedUnitPrice(landed);
  return {
    quotedPrice,
    landed,
    shippingCost,
    quoteBlockedReason: quotedPrice == null ? QUOTE_NEEDED_LABEL : null,
  };
}
