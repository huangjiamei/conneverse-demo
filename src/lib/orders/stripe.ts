/**
 * Stripe 客户端 —— 单例 + 「没配 key 也别崩」。
 *
 * key 还没发下来的阶段,整个应用仍要能跑:所以这里不在模块加载时抛错,
 * 而是让调用方先问 isStripeConfigured(),没配就回一句人话给店铺
 * ("Payments are not configured yet"),而不是 500。
 *
 * key 只从环境变量读,永远不进仓库 (线上放 Vercel env)。
 */

import Stripe from "stripe";

export const STRIPE_NOT_CONFIGURED =
  "Payments are not configured yet. Please contact PartHand.";

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

/**
 * @returns null 表示没配 key —— 调用方负责给出 STRIPE_NOT_CONFIGURED,
 *          不要在这里抛,否则一个没配环境的 demo 会整页 500。
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    // apiVersion 交给 SDK 的默认值 —— 锁死版本号反而会在升级 SDK 时静默不一致
    cached = new Stripe(key);
  }
  return cached;
}

/**
 * success/cancel 要绝对 URL。
 *
 * 实现搬到 lib/appUrl.ts 了 —— 邮件链接也要同一个地址,两处各算一遍迟早分叉。
 * 这里保留导出,免得动 orders 那边的 import。
 */
export { appUrl } from "@/lib/appUrl";
