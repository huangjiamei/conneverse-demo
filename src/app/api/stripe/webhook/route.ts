/**
 * POST /api/stripe/webhook —— 收款回调,唯一把订单置为 PAID 的地方。
 *
 * 三件事必须做对:
 *   1. **验签**。这个端点是公开的 (Stripe 没有我们的会话 cookie —— 见
 *      lib/auth/routes 的 PUBLIC_APIS),所以除了签名没有别的东西能证明
 *      这个请求来自 Stripe。签名不过就 400,不看 body。
 *   2. **原始 body**。验签算的是字节,不是解析后的对象 —— 所以只能 req.text(),
 *      一旦先 req.json() 再 stringify 回去就对不上了。
 *   3. **幂等**。Stripe 会重投同一个事件 (超时、手动 resend)。这里靠
 *      "仅当状态还是 PENDING_PAYMENT 时才更新" 收口:updateMany 的 where 里
 *      带上状态,重投时匹配 0 行,自然什么都不做。
 *
 * 只认 checkout.session.completed —— 建会话时用的是 mode: "payment",
 * 这个事件到达时款已经收妥。
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, webhookSecret } from "@/lib/orders/stripe";
import { toDecimal } from "@/lib/orders/pricing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = webhookSecret();
  if (!stripe || !secret) {
    // 没配 key 时不假装成功 —— 让 Stripe 那边看到失败并重试
    console.error("[stripe] webhook hit but Stripe is not configured");
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // 必须是原始字节 —— 别在这之前解析 body
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[stripe] signature verification failed:", detail);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // 其它事件照样回 200,否则 Stripe 会一直重投它自己也没在等的东西
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const checkout = event.data.object as Stripe.Checkout.Session;
  const purchaseOrderId = checkout.metadata?.purchaseOrderId;
  if (!purchaseOrderId) {
    console.error("[stripe] checkout.session.completed without purchaseOrderId");
    return NextResponse.json({ received: true, ignored: "no metadata" });
  }

  const paymentIntentId =
    typeof checkout.payment_intent === "string"
      ? checkout.payment_intent
      : (checkout.payment_intent?.id ?? null);

  // amount_total 是最小货币单位 (分)
  const amountPaid =
    checkout.amount_total != null ? checkout.amount_total / 100 : null;

  // 幂等的关键:where 里带 status —— 重投时匹配 0 行, 不会二次改
  const result = await prisma.purchaseOrder.updateMany({
    where: { id: purchaseOrderId, status: "PENDING_PAYMENT" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntentId,
      ...(amountPaid != null ? { amountPaid: toDecimal(amountPaid) } : {}),
    },
  });

  if (result.count === 0) {
    // 已处理过 / 已被取消 —— 都不是错误, 回 200 让 Stripe 别再投了
    console.info(
      `[stripe] order ${purchaseOrderId} was not in PENDING_PAYMENT — ignoring replay`
    );
  }

  return NextResponse.json({ received: true });
}
