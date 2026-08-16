"use client";

/**
 * Place Order —— 店铺侧的下单入口。
 *
 * 四种状态,顺序就是判断顺序:
 *   1. 报不了价 (运费算不出)      → "Quote needed",禁用。给不出可信全包价就
 *                                   不能提前一次收清,以后走人工报价。
 *   2. 角色不对 (平台管理员) 或
 *      店铺地址不全               → 禁用 + 一句原因;店铺管理员额外给 /shop 链接,
 *                                   员工给不了 (他进不去 /shop),所以只给一句话。
 *   3. 正常                       → 可点,建单 → 跳 Stripe 托管页。
 *   4. 提交中 / 出错               → 转圈 / 错误一行。
 *
 * 按钮本身只是第一道闸 —— 真正的校验在 POST /api/orders 再做一遍 (角色、地址、
 * 价格、活跃单),前端禁用只是省一次往返。
 *
 * 两个尺寸沿用它替掉的那个 "Select" 按钮,让 admin 表格行和客户卡片保持一致。
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { OrderingContext } from "@/lib/userResultsData";

const SIZE = {
  sm: "px-3 py-1.5 text-[12px]",
  md: "px-5 py-2 text-[13px]",
} as const;

const BASE =
  "shrink-0 inline-flex items-center gap-1.5 rounded-lg font-bold whitespace-nowrap transition";
const ENABLED = "bg-[#00B4A6] text-white hover:bg-[#00A396]";
const DISABLED = "bg-gray-200 text-gray-400 cursor-not-allowed";

export type PlaceOrderTarget = {
  candidateId: string;
  /** 报不了价时为 null —— 此时按钮必须禁用 */
  quotedPrice: string | null;
  quoteBlockedReason: string | null;
  /** RO 行下单时带上,独立搜索为 null */
  partLineId?: string | null;
  /** 默认数量 (RO 行用 PartLine.quantity) */
  defaultQuantity?: number;
};

export function PlaceOrderButton({
  size = "sm",
  className = "",
  target,
  ordering,
}: {
  size?: keyof typeof SIZE;
  className?: string;
  target: PlaceOrderTarget;
  ordering: OrderingContext;
}) {
  const [qty, setQty] = useState(
    Math.max(1, Math.floor(target.defaultQuantity ?? 1))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 判断顺序即优先级:报不了价最硬,其次角色/地址
  const blocked =
    target.quotedPrice == null
      ? (target.quoteBlockedReason ?? "Quote needed")
      : !ordering.canOrder
        ? ordering.blockedReason
        : null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: target.candidateId,
          partLineId: target.partLineId ?? null,
          quantity: qty,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data?.error as string) ?? `Couldn't start checkout (HTTP ${res.status}).`);
        return;
      }
      // 服务端已经建好 PENDING_PAYMENT 的单 —— 跳 Stripe 托管页付款
      if (typeof data?.checkoutUrl === "string") {
        window.location.href = data.checkoutUrl;
        return;
      }
      setError("Checkout session was not created. Please try again.");
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (blocked) {
    return (
      <span
        className={`inline-flex flex-col ${size === "sm" ? "items-end" : "items-start"} gap-1`}
      >
        <button
          type="button"
          disabled
          title={blocked}
          aria-label={`Place Order — ${blocked}`}
          className={`${BASE} ${DISABLED} ${SIZE[size]} ${className}`}
        >
          Place Order
        </button>
        <span className="text-[10px] leading-tight text-gray-400 max-w-[190px] text-right">
          {blocked}
          {ordering.fixAddressHref && (
            <>
              {" "}
              <Link
                href={ordering.fixAddressHref}
                className="text-[#00B4A6] hover:underline"
              >
                Add it
              </Link>
            </>
          )}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <label className="sr-only" htmlFor={`qty-${target.candidateId}`}>
        Quantity
      </label>
      <input
        id={`qty-${target.candidateId}`}
        type="number"
        min={1}
        max={99}
        value={qty}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          setQty(Number.isFinite(n) && n >= 1 ? Math.min(n, 99) : 1);
        }}
        disabled={submitting}
        aria-label="Quantity"
        className="w-12 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-[12px] tabular-nums
                   focus:border-[#00B4A6] focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30
                   disabled:bg-gray-50"
      />
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className={`${BASE} ${ENABLED} ${SIZE[size]} disabled:opacity-60 ${className}`}
        >
          {submitting && <Loader2 size={13} className="animate-spin" />}
          Place Order
        </button>
        {error && (
          <span className="max-w-[200px] text-right text-[10px] leading-tight text-red-600">
            {error}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * 平台管理员的内部表格里用的占位 —— 他们履约,不下单。
 * 保留按钮位置让表格行与客户卡片对齐。
 */
export function PlaceOrderPlaceholder({
  size = "sm",
  reason = "Platform admins fulfil orders — they don't place them.",
}: {
  size?: keyof typeof SIZE;
  reason?: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={reason}
      aria-label={`Place Order — ${reason}`}
      className={`${BASE} ${DISABLED} ${SIZE[size]}`}
    >
      Place Order
    </button>
  );
}
