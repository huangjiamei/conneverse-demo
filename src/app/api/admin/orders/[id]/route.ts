/**
 * PATCH /api/admin/orders/[id] —— 履约动作,仅平台管理员。
 *
 * Body: { action: "purchase" | "ship" | "deliver" | "refund" | "cancel", ... }
 *
 * 每个动作都:
 *   1. 在**事务内**先读当前状态 (不是读完再写 —— 两次点击会撞上同一个旧状态)
 *   2. 过 canTransition 校验合法流转,非法一律拒
 *   3. 只用 updateMany + where.status 落地,所以并发的第二次必然匹配 0 行
 *
 * 退款先打 Stripe 再落库:Stripe 那边成功了库里没记上,比库里记了钱没退要好
 * 修 —— 前者对账能发现,后者店铺以为退了其实没退。
 *
 * /admin/** 已经被 proxy + canAccess 锁成平台管理员, 这里再查一次库 (B8)。
 */

import { NextResponse } from "next/server";
import type { OrderCancelReason, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/auth/liveSession";
import { canTransition, transitionError } from "@/lib/orders/status";
import { getStripe, isStripeConfigured, STRIPE_NOT_CONFIGURED } from "@/lib/orders/stripe";
import { decimalToString, toDecimal } from "@/lib/orders/pricing";

export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  externalOrderId?: string;
  actualCost?: string | number;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string | null;
  cancelReason?: string;
};

const REFUND_REASONS: OrderCancelReason[] = ["OUT_OF_STOCK", "PRICE_CHANGED"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      quotedPrice: true,
      quantity: true,
      amountPaid: true,
      stripePaymentIntentId: true,
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  switch (body.action) {
    case "purchase":
      return purchase(order.id, order.status, body);
    case "ship":
      return ship(order.id, order.status, body);
    case "deliver":
      return deliver(order.id, order.status);
    case "refund":
      return refund(order, body);
    case "cancel":
      return cancel(order, body);
    default:
      return NextResponse.json(
        {
          error:
            "action must be one of: purchase, ship, deliver, refund, cancel",
        },
        { status: 400 }
      );
  }
}

/** 状态机守门 —— 所有动作的第一句 */
function guard(from: OrderStatus, to: OrderStatus): NextResponse | null {
  if (!canTransition(from, to)) {
    return NextResponse.json({ error: transitionError(from, to) }, { status: 409 });
  }
  return null;
}

/**
 * 落地一次流转。where 带上 from 状态 —— 并发的第二次请求匹配 0 行,
 * 于是"重复点 Mark purchased"不会二次改。
 */
async function commit(
  id: string,
  from: OrderStatus,
  data: Record<string, unknown>
): Promise<NextResponse> {
  const res = await prisma.purchaseOrder.updateMany({
    where: { id, status: from },
    data,
  });
  if (res.count === 0) {
    return NextResponse.json(
      { error: "This order already moved on — reload and try again." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, status: data.status });
}

// ---- 动作 ----------------------------------------------------------------

/** 已经去 eBay 买了:记下单号和真实成本 */
async function purchase(id: string, from: OrderStatus, body: Body) {
  const blocked = guard(from, "PURCHASED");
  if (blocked) return blocked;

  const externalOrderId = (body.externalOrderId ?? "").trim();
  if (!externalOrderId) {
    return NextResponse.json(
      { error: "externalOrderId is required to mark an order purchased." },
      { status: 400 }
    );
  }
  const actualCost = Number(body.actualCost);
  if (!Number.isFinite(actualCost) || actualCost < 0) {
    return NextResponse.json(
      { error: "actualCost must be a non-negative amount." },
      { status: 400 }
    );
  }

  return commit(id, from, {
    status: "PURCHASED",
    purchasedAt: new Date(),
    externalOrderId,
    actualCost: toDecimal(actualCost),
  });
}

/** 已发货:承运商 + 单号 (店铺侧从这一步才看得到物流) */
async function ship(id: string, from: OrderStatus, body: Body) {
  const blocked = guard(from, "SHIPPED");
  if (blocked) return blocked;

  const carrier = (body.carrier ?? "").trim();
  const trackingNumber = (body.trackingNumber ?? "").trim();
  if (!carrier || !trackingNumber) {
    return NextResponse.json(
      { error: "carrier and trackingNumber are required to mark an order shipped." },
      { status: 400 }
    );
  }

  return commit(id, from, {
    status: "SHIPPED",
    shippedAt: new Date(),
    carrier,
    trackingNumber,
    trackingUrl: body.trackingUrl?.trim() || null,
  });
}

async function deliver(id: string, from: OrderStatus) {
  const blocked = guard(from, "DELIVERED");
  if (blocked) return blocked;
  return commit(id, from, { status: "DELIVERED", deliveredAt: new Date() });
}

type OrderForMoney = {
  id: string;
  status: OrderStatus;
  quotedPrice: Prisma.Decimal;
  quantity: number;
  amountPaid: Prisma.Decimal | null;
  stripePaymentIntentId: string | null;
};

/**
 * 实收金额:优先用 Stripe 回来的 amountPaid (那是真正扣掉的钱),
 * 没有才退回按报价 × 数量算。
 */
function refundableAmount(order: OrderForMoney): number {
  const paid = decimalToString(order.amountPaid);
  if (paid != null) return Number(paid);
  return Number(decimalToString(order.quotedPrice)) * order.quantity;
}

/**
 * 退款并置 REFUNDED。先打 Stripe 再落库 —— 顺序见文件头。
 * 幂等:commit 的 where 带 from 状态,重复点第二次匹配 0 行;Stripe 那边
 * 同一个 payment_intent 全额退第二次会被它自己拒掉 (already_refunded)。
 */
async function refund(order: OrderForMoney, body: Body) {
  const blocked = guard(order.status, "REFUNDED");
  if (blocked) return blocked;

  const reason = body.cancelReason as OrderCancelReason | undefined;
  if (!reason || !REFUND_REASONS.includes(reason)) {
    return NextResponse.json(
      { error: `cancelReason must be one of: ${REFUND_REASONS.join(", ")}` },
      { status: 400 }
    );
  }

  const refundResult = await issueStripeRefund(order);
  if ("error" in refundResult) return refundResult.error;

  return commit(order.id, order.status, {
    status: "REFUNDED",
    refundedAt: new Date(),
    cancelReason: reason,
    stripeRefundId: refundResult.refundId,
    refundedAmount: toDecimal(refundResult.amount),
  });
}

/**
 * 取消 (采购前,店铺提出)。已经收过款就连带退款。
 * PENDING_PAYMENT 的单没收到钱,直接取消即可。
 */
async function cancel(order: OrderForMoney, body: Body) {
  const blocked = guard(order.status, "CANCELLED");
  if (blocked) return blocked;

  const data: Record<string, unknown> = {
    status: "CANCELLED",
    cancelledAt: new Date(),
    cancelReason: (body.cancelReason as OrderCancelReason) ?? "SHOP_REQUESTED",
  };

  if (order.status === "PAID") {
    const refundResult = await issueStripeRefund(order);
    if ("error" in refundResult) return refundResult.error;
    data.stripeRefundId = refundResult.refundId;
    data.refundedAmount = toDecimal(refundResult.amount);
    data.refundedAt = new Date();
  }

  return commit(order.id, order.status, data);
}

/** 走一次 Stripe 全额退款。返回 { error } 表示已经准备好回给调用方的响应。 */
async function issueStripeRefund(
  order: OrderForMoney
): Promise<{ refundId: string; amount: number } | { error: NextResponse }> {
  if (!order.stripePaymentIntentId) {
    return {
      error: NextResponse.json(
        { error: "This order has no payment to refund." },
        { status: 409 }
      ),
    };
  }
  if (!isStripeConfigured()) {
    return {
      error: NextResponse.json({ error: STRIPE_NOT_CONFIGURED }, { status: 503 }),
    };
  }
  const stripe = getStripe();
  if (!stripe) {
    return {
      error: NextResponse.json({ error: STRIPE_NOT_CONFIGURED }, { status: 503 }),
    };
  }

  const amount = refundableAmount(order);
  try {
    const refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount: Math.round(amount * 100),
    });
    return { refundId: refund.id, amount };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[orders] refund failed:", detail);
    return {
      error: NextResponse.json(
        { error: `Stripe refund failed: ${detail}` },
        { status: 502 }
      ),
    };
  }
}
