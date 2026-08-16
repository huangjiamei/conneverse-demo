"use client";

/**
 * 履约面板的交互部分 —— 展开一行,填表,走一个动作。
 *
 * 前端只负责"当前状态下哪些动作有意义"(见 ACTIONS_BY_STATUS),真正的守门
 * 在 PATCH /api/admin/orders/[id]:那边事务内再验一次状态,所以就算这里放行了
 * 一个非法动作,也改不动数据。按钮禁用是省一次往返,不是安全边界。
 *
 * 动作跑完 router.refresh() —— 让服务端重新算队列顺序和计数,不在客户端猜。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import type { OrderCancelReason, OrderStatus } from "@prisma/client";

export type AdminOrderRow = {
  id: string;
  createdAt: string;
  status: OrderStatus;
  title: string;
  imageUrl: string | null;
  quantity: number;
  currency: string;
  quotedPrice: string;
  actualCost: string | null;
  amountPaid: string | null;
  refundedAmount: string | null;
  supplierItemUrl: string | null;
  supplierItemId: string | null;
  externalOrderId: string | null;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  cancelReason: OrderCancelReason | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shopName: string;
  orderedBy: string | null;
  roNumber: string | null;
  shipTo: string;
  shipToPhone: string | null;
};

type Action = "purchase" | "ship" | "deliver" | "refund" | "cancel";

/** 与 lib/orders/status 的流转表一致 —— 那边是权威,这里只是别显示无意义的按钮 */
const ACTIONS_BY_STATUS: Record<OrderStatus, Action[]> = {
  PENDING_PAYMENT: ["cancel"],
  PAID: ["purchase", "refund", "cancel"],
  PURCHASED: ["ship"],
  SHIPPED: ["deliver"],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

const STATUS_CLS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-gray-100 text-gray-600 border-gray-300",
  PAID: "bg-amber-50 text-amber-700 border-amber-200",
  PURCHASED: "bg-teal-50 text-teal-700 border-teal-200",
  SHIPPED: "bg-blue-50 text-blue-700 border-blue-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-gray-100 text-gray-500 border-gray-300",
  REFUNDED: "bg-red-50 text-red-700 border-red-200",
};

export function AdminOrdersClient({ rows }: { rows: AdminOrderRow[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((o) => (
        <OrderRow key={o.id} order={o} />
      ))}
    </ul>
  );
}

function OrderRow({ order }: { order: AdminOrderRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 表单字段
  const [externalOrderId, setExternalOrderId] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [refundReason, setRefundReason] =
    useState<OrderCancelReason>("OUT_OF_STOCK");

  const quoted = Number(order.quotedPrice) * order.quantity;
  const cost = order.actualCost == null ? null : Number(order.actualCost);
  const margin = cost == null ? null : quoted - cost;
  const actions = ACTIONS_BY_STATUS[order.status];

  async function run(action: Action, payload: Record<string, unknown> = {}) {
    setError(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data?.error as string) ?? `Failed (HTTP ${res.status}).`);
        return;
      }
      // 队列顺序和计数都由服务端算 —— 重新拉一次而不是在本地改状态
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        {order.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={order.imageUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg border border-gray-100 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[#1A1A2E]">
            {order.title}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {order.shopName}
            {order.orderedBy && ` · ${order.orderedBy}`}
            {order.roNumber && ` · RO #${order.roNumber}`}
            {order.quantity > 1 && ` · Qty ${order.quantity}`}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-[#1A1A2E]">
            ${quoted.toFixed(2)}
          </div>
          {margin != null && (
            <div
              className={`text-[11px] tabular-nums ${
                margin >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {margin >= 0 ? "+" : "−"}${Math.abs(margin).toFixed(2)} margin
            </div>
          )}
        </div>

        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLS[order.status]}`}
        >
          {order.status.replace("_", " ").toLowerCase()}
        </span>

        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4">
          {/* 内部信息 —— 只在这个面板出现 */}
          <div className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <Field label="Ship to">
              {order.shipTo}
              {order.shipToPhone && ` · ${order.shipToPhone}`}
            </Field>
            <Field label="Source">
              {order.supplierItemUrl ? (
                <a
                  href={order.supplierItemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#00B4A6] hover:underline"
                >
                  eBay {order.supplierItemId} <ExternalLink size={10} />
                </a>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Quoted / paid">
              ${quoted.toFixed(2)}
              {order.amountPaid && ` · paid $${Number(order.amountPaid).toFixed(2)}`}
            </Field>
            <Field label="Cost">
              {cost == null ? "—" : `$${cost.toFixed(2)}`}
              {order.externalOrderId && ` · ${order.externalOrderId}`}
            </Field>
            <Field label="Stripe">
              {order.stripePaymentIntentId ?? "—"}
              {order.stripeRefundId && ` · refund ${order.stripeRefundId}`}
            </Field>
            <Field label="Refunded">
              {order.refundedAmount
                ? `$${Number(order.refundedAmount).toFixed(2)}${
                    order.cancelReason ? ` · ${order.cancelReason}` : ""
                  }`
                : "—"}
            </Field>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {actions.length === 0 ? (
            <p className="mt-4 text-xs text-gray-400">
              This order is in a final state — no further actions.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {actions.includes("purchase") && (
                <ActionForm
                  title="Mark purchased"
                  busy={busy === "purchase"}
                  onSubmit={() =>
                    run("purchase", { externalOrderId, actualCost })
                  }
                  disabled={!externalOrderId.trim() || actualCost.trim() === ""}
                >
                  <Input
                    placeholder="eBay order number"
                    value={externalOrderId}
                    onChange={setExternalOrderId}
                  />
                  <Input
                    placeholder="Actual cost"
                    value={actualCost}
                    onChange={setActualCost}
                    type="number"
                  />
                </ActionForm>
              )}

              {actions.includes("ship") && (
                <ActionForm
                  title="Mark shipped"
                  busy={busy === "ship"}
                  onSubmit={() =>
                    run("ship", { carrier, trackingNumber, trackingUrl })
                  }
                  disabled={!carrier.trim() || !trackingNumber.trim()}
                >
                  <Input
                    placeholder="Carrier"
                    value={carrier}
                    onChange={setCarrier}
                  />
                  <Input
                    placeholder="Tracking number"
                    value={trackingNumber}
                    onChange={setTrackingNumber}
                  />
                  <Input
                    placeholder="Tracking URL (optional)"
                    value={trackingUrl}
                    onChange={setTrackingUrl}
                  />
                </ActionForm>
              )}

              {actions.includes("deliver") && (
                <ActionForm
                  title="Mark delivered"
                  busy={busy === "deliver"}
                  onSubmit={() => run("deliver")}
                />
              )}

              {actions.includes("refund") && (
                <ActionForm
                  title="Refund"
                  tone="danger"
                  busy={busy === "refund"}
                  onSubmit={() => run("refund", { cancelReason: refundReason })}
                >
                  <select
                    value={refundReason}
                    onChange={(e) =>
                      setRefundReason(e.target.value as OrderCancelReason)
                    }
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-[12px]"
                  >
                    <option value="OUT_OF_STOCK">Out of stock</option>
                    <option value="PRICE_CHANGED">Price changed</option>
                  </select>
                </ActionForm>
              )}

              {actions.includes("cancel") && (
                <ActionForm
                  title="Cancel (shop requested)"
                  tone="danger"
                  busy={busy === "cancel"}
                  onSubmit={() => run("cancel", { cancelReason: "SHOP_REQUESTED" })}
                />
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 break-words text-gray-700">{children}</div>
    </div>
  );
}

function Input({
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      step={type === "number" ? "0.01" : undefined}
      min={type === "number" ? "0" : undefined}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-[12px]
                 focus:border-[#00B4A6] focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30"
    />
  );
}

function ActionForm({
  title,
  children,
  onSubmit,
  busy,
  disabled = false,
  tone = "primary",
}: {
  title: string;
  children?: React.ReactNode;
  onSubmit: () => void;
  busy: boolean;
  disabled?: boolean;
  tone?: "primary" | "danger";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
      <span className="shrink-0 text-[12px] font-medium text-[#1A1A2E]">
        {title}
      </span>
      {children}
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || disabled}
        className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white transition disabled:opacity-40 ${
          tone === "danger"
            ? "bg-red-600 hover:bg-red-700"
            : "bg-[#00B4A6] hover:bg-[#00A396]"
        }`}
      >
        {busy && <Loader2 size={12} className="animate-spin" />}
        Confirm
      </button>
    </div>
  );
}
