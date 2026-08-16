/**
 * POST /api/orders —— 店铺下单 (转售模式:先付全款,我们再去采购)。
 *
 * Body: { candidateId: string, partLineId?: string | null, quantity?: number }
 *
 * 流程:
 *   1. 会话 → shopId / orderedByUserId (绝不信客户端传的 shopId)
 *   2. candidate 必须在这个会话的可见范围内 (换个 id 下别人的单要挡住)
 *   3. 服务端**重算** quotedPrice —— 前端传什么价都不看
 *   4. 同一 candidate 已有活跃单 → 拒 (终态后可重下, 见 lib/orders/scope)
 *   5. 事务里建 PENDING_PAYMENT 的 PurchaseOrder + 收货地址快照
 *   6. 建 Stripe Checkout Session (metadata.purchaseOrderId), 返回托管页 URL
 *
 * supplierItemUrl 只写库、绝不下发前端。
 * 付款成功由 webhook 置 PAID —— 这里不碰状态。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/auth/liveSession";
import { searchVisibilityWhere } from "@/lib/searchScope";
import { ACTIVE_ORDER_STATUSES, canPlaceOrder } from "@/lib/orders/scope";
import { isAddressComplete } from "@/lib/userResultsData";
import {
  orderTotal,
  priceCandidate,
  toDecimal,
} from "@/lib/orders/pricing";
import {
  appUrl,
  getStripe,
  isStripeConfigured,
  STRIPE_NOT_CONFIGURED,
} from "@/lib/orders/stripe";

export const dynamic = "force-dynamic";

type Body = {
  candidateId?: string;
  partLineId?: string | null;
  quantity?: number;
};

/** rawResponse 里那条候选 —— 只为了拿运费 */
type RawCandidate = {
  item_id?: string;
  optimizer_fields?: { shipping_cost?: string | number | null };
};

const MAX_QUANTITY = 99;

export async function POST(req: Request) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // 平台管理员负责履约, 不下单
  if (!canPlaceOrder(session)) {
    return NextResponse.json(
      { error: "Platform admins fulfil orders — they don't place them." },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const candidateId = body.candidateId;
  if (!candidateId) {
    return NextResponse.json(
      { error: "Body must include { candidateId: string }" },
      { status: 400 }
    );
  }

  const rawQty = body.quantity ?? 1;
  const quantity = Math.floor(Number(rawQty));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return NextResponse.json(
      { error: `Quantity must be a whole number between 1 and ${MAX_QUANTITY}.` },
      { status: 400 }
    );
  }

  // 候选必须落在这个会话看得到的搜索里 —— 否则换个 candidateId 就能下别人的单
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, matchSearch: searchVisibilityWhere(session) },
    include: { matchSearch: { select: { rawResponse: true } } },
  });
  if (!candidate) {
    // 不存在和没权限给同一个回复, 不泄露"存在但看不到"
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  // partLineId 只接受这个会话所属店铺的行 (RO 流程) —— 不校验就能挂到别店的 RO 上
  let partLineId: string | null = null;
  if (body.partLineId) {
    const line = await prisma.partLine.findFirst({
      where: {
        id: body.partLineId,
        repairOrder: { shopId: session.shopId },
      },
      select: { id: true },
    });
    if (!line) {
      return NextResponse.json({ error: "Part line not found." }, { status: 404 });
    }
    partLineId = line.id;
  }

  const shop = await prisma.shop.findUnique({
    where: { id: session.shopId },
    select: {
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      zip: true,
      phone: true,
    },
  });
  if (!shop || !isAddressComplete(shop)) {
    return NextResponse.json(
      {
        error:
          session.role === "SHOP_ADMIN"
            ? "Add your shop's shipping address before ordering."
            : "Ask your shop admin to complete the shop address.",
      },
      { status: 400 }
    );
  }

  // ---- 服务端重算价格 (B8: 不信前端传的价) --------------------------------
  const raw = candidate.matchSearch.rawResponse as {
    candidate_info_list?: RawCandidate[];
  } | null;
  const rawCandidate = raw?.candidate_info_list?.find(
    (c) => c.item_id === candidate.ebayItemId
  );
  const pricing = priceCandidate(
    Number(candidate.price),
    rawCandidate?.optimizer_fields?.shipping_cost
  );
  if (pricing.quotedPrice == null) {
    // 运费算不出 → 报不了可信全包价 → 不能提前一次收清 (B3)
    return NextResponse.json(
      { error: "This item can't be quoted for instant ordering yet." },
      { status: 409 }
    );
  }
  const unitPrice = pricing.quotedPrice;
  const total = orderTotal(unitPrice, quantity);

  // Stripe 没配就别建单 —— 否则留下一张永远付不了款的 PENDING_PAYMENT
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: STRIPE_NOT_CONFIGURED }, { status: 503 });
  }

  // ---- 建单 (事务内先查活跃单, 防同一件重复下) ---------------------------
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const active = await tx.purchaseOrder.findFirst({
        where: {
          candidateId: candidate.id,
          status: { in: ACTIVE_ORDER_STATUSES },
        },
        select: { id: true },
      });
      if (active) {
        throw new ActiveOrderError();
      }
      return tx.purchaseOrder.create({
        data: {
          shopId: session.shopId,
          orderedByUserId: session.id,
          partLineId,
          candidateId: candidate.id,
          // 商品快照 —— 之后 candidate 被改/删也不影响这张单
          supplier: "EBAY",
          supplierItemId: candidate.ebayItemId,
          supplierItemUrl: candidate.itemUrl, // 只入库, 绝不下发前端
          title: candidate.title,
          imageUrl: candidate.imageUrl,
          quantity,
          currency: candidate.currency,
          quotedPrice: toDecimal(unitPrice),
          // 收货快照 —— 下单当时的店铺地址, 之后店铺改地址不影响这张单
          shipToLine1: shop.addressLine1,
          shipToLine2: shop.addressLine2,
          shipToCity: shop.city,
          shipToState: shop.state,
          shipToZip: shop.zip,
          shipToPhone: shop.phone,
          status: "PENDING_PAYMENT",
        },
        select: { id: true, title: true, imageUrl: true, currency: true },
      });
    });
  } catch (e) {
    if (e instanceof ActiveOrderError) {
      return NextResponse.json(
        { error: "There's already an open order for this item." },
        { status: 409 }
      );
    }
    throw e;
  }

  // ---- Stripe Checkout ---------------------------------------------------
  const stripe = getStripe();
  if (!stripe) {
    await prisma.purchaseOrder.delete({ where: { id: order.id } });
    return NextResponse.json({ error: STRIPE_NOT_CONFIGURED }, { status: 503 });
  }

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity,
          price_data: {
            currency: order.currency.toLowerCase(),
            // Stripe 收的是最小货币单位 —— 单价 × 100 再取整到分
            unit_amount: Math.round(unitPrice * 100),
            product_data: {
              name: order.title.slice(0, 250),
              ...(order.imageUrl ? { images: [order.imageUrl] } : {}),
            },
          },
        },
      ],
      success_url: `${appUrl()}/orders/${order.id}?checkout=success`,
      cancel_url: `${appUrl()}/orders/${order.id}?checkout=cancel`,
      // webhook 靠它找回这张单
      metadata: { purchaseOrderId: order.id },
      payment_intent_data: { metadata: { purchaseOrderId: order.id } },
    });

    if (!checkout.url) throw new Error("Stripe returned no checkout URL");

    return NextResponse.json({
      purchaseOrderId: order.id,
      checkoutUrl: checkout.url,
      total: total.toFixed(2),
    });
  } catch (err) {
    // 建会话失败 = 这张单从没存在过, 删掉, 免得占着 candidate 的活跃位
    await prisma.purchaseOrder.delete({ where: { id: order.id } }).catch(() => {});
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[orders] checkout session failed:", detail);
    return NextResponse.json(
      { error: "Couldn't start checkout. Please try again." },
      { status: 502 }
    );
  }
}

/** 事务内用来回滚的哨兵 —— 不是真错误, 是"这件已经有单了" */
class ActiveOrderError extends Error {}
