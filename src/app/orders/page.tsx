"use client";

/**
 * /orders — the orders board: every ordered line, its status, promised
 * ETA, and a LOUD delay state. This is the anti-"Awaiting Parts 266h"
 * feature: nothing sits silently.
 *
 * Status updates are manual (concierge ops buttons) for now; they call
 * POST /api/orders/status — the same seam carrier/supplier webhooks
 * will call, so the board needs no changes when real tracking lands.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileDown,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useShop } from "@/context/ShopContext";
import { formatPrice } from "@/lib/format";
import type { OrderStatus, PublicOrder } from "@/types/canonical";
import { GRADE_TIER_LABEL } from "@/types/canonical";

const FLOW: OrderStatus[] = ["ordered", "shipped", "delivered", "installed"];

const STATUS_LABEL: Record<OrderStatus, string> = {
  ordered: "Ordered",
  shipped: "Shipped",
  delivered: "Delivered",
  installed: "Installed",
  exception: "Exception",
};

const BASELINE_METHOD: Record<string, string> = {
  shop_history: "vs. your avg paid price",
  market_snapshot: "vs. same-search alternative",
};

function isDelayed(order: PublicOrder): boolean {
  if (order.status === "delivered" || order.status === "installed") {
    return false;
  }
  return Date.now() > new Date(order.etaDate).getTime();
}

function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = FLOW.indexOf(status);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}

function Stepper({ order }: { order: PublicOrder }) {
  const currentIdx =
    order.status === "exception"
      ? FLOW.indexOf(order.statusHistory.at(-2)?.status ?? "ordered")
      : FLOW.indexOf(order.status);

  return (
    <div className="flex items-center gap-1">
      {FLOW.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              i <= currentIdx
                ? "bg-teal/10 text-teal"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {i <= currentIdx && <Check size={9} />}
            {STATUS_LABEL[s]}
          </div>
          {i < FLOW.length - 1 && (
            <div
              className={`w-4 h-px ${
                i < currentIdx ? "bg-teal/40" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const { profile } = useShop();
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const data = await fetch("/api/orders").then((r) => r.json());
      setOrders(
        (data.orders ?? []).sort(
          (a: PublicOrder, b: PublicOrder) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
    } catch {
      // keep current
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function setStatus(orderId: string, status: OrderStatus) {
    await fetch("/api/orders/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status }),
    });
    refresh();
  }

  async function downloadPo(order: PublicOrder, index: number) {
    const { generatePurchaseOrderPDF } = await import(
      "@/lib/generate-po-pdf"
    );
    generatePurchaseOrderPDF({
      order,
      shop: {
        name: profile?.shopName ?? "Shop",
        address: profile?.address ?? "",
        phone: profile?.phone ?? "",
      },
      groupIndex: index + 1,
    });
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="bg-[#1B2838] text-white">
        <div className="max-w-[1000px] mx-auto px-6 h-14 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold tracking-tight">Orders</span>
            <span className="block text-[11px] text-teal -mt-0.5">
              {profile?.shopName}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 text-[12px] text-gray-300 hover:text-white transition"
            >
              <RefreshCcw size={13} className={busy ? "animate-spin" : ""} />
              Refresh
            </button>
            <Link
              href="/analytics"
              className="text-[12px] text-gray-300 hover:text-white transition"
            >
              Savings
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[12px] text-gray-300 hover:text-white transition"
            >
              <ArrowLeft size={13} />
              Back to sourcing
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 py-8 space-y-4">
        {orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <PackageCheck size={36} className="mx-auto text-gray-300" />
            <p className="mt-3 text-base font-medium text-gray-600">
              No orders yet.
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Build a quote in sourcing and hit &ldquo;Place Order&rdquo;.
            </p>
          </div>
        ) : (
          orders.map((order, idx) => {
            const delayed = isDelayed(order);
            const exception = order.status === "exception";
            const alarm = delayed || exception;
            const next = nextStatus(order.status);
            return (
              <div
                key={order.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                  alarm ? "border-red-300" : "border-gray-200"
                }`}
              >
                {alarm && (
                  <div className="bg-red-50 border-b border-red-100 px-5 py-2 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-600" />
                    <span className="text-[12px] font-semibold text-red-700">
                      {exception
                        ? `Exception — ${order.statusHistory.at(-1)?.note ?? "needs attention"}`
                        : `Delayed — promised ${new Date(order.etaDate).toLocaleDateString("en-US")}`}
                    </span>
                  </div>
                )}
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-dark">
                        {order.vehicle.year} {order.vehicle.make}{" "}
                        {order.vehicle.model}
                        <span className="ml-2 text-[11px] font-normal text-gray-400">
                          {order.id} ·{" "}
                          {new Date(order.createdAt).toLocaleDateString(
                            "en-US"
                          )}
                        </span>
                      </p>
                      <p
                        className={`mt-1 text-[13px] font-medium ${
                          alarm ? "text-red-600" : "text-dark"
                        }`}
                      >
                        ETA{" "}
                        {new Date(order.etaDate).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <div className="mt-2">
                        <Stepper order={order} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {next && !exception && (
                        <button
                          onClick={() => setStatus(order.id, next)}
                          className="px-3 py-1.5 rounded-lg bg-teal text-white text-[11px] font-medium hover:bg-teal/90 transition"
                        >
                          Mark {STATUS_LABEL[next].toLowerCase()}
                        </button>
                      )}
                      {!exception &&
                        order.status !== "installed" &&
                        order.status !== "delivered" && (
                          <button
                            onClick={() => setStatus(order.id, "exception")}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-[11px] font-medium hover:bg-red-50 transition"
                          >
                            Flag exception
                          </button>
                        )}
                      {exception && (
                        <button
                          onClick={() => setStatus(order.id, "ordered")}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[11px] font-medium hover:bg-gray-50 transition"
                        >
                          Resume
                        </button>
                      )}
                      <button
                        onClick={() => downloadPo(order, idx)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[11px] font-medium hover:bg-gray-50 transition"
                      >
                        <FileDown size={12} />
                        PO
                      </button>
                    </div>
                  </div>

                  {/* Lines + savings */}
                  <div className="mt-4 border-t border-gray-100 pt-3 space-y-2">
                    {order.lines.map((line) => {
                      const b = line.baseline;
                      const savings =
                        b.baselinePrice != null
                          ? (b.baselinePrice - line.unitPricePaid) * line.qty
                          : null;
                      return (
                        <div
                          key={line.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-dark">
                              {line.partName}
                            </span>{" "}
                            <span className="text-gray-400">
                              · {line.brand} ·{" "}
                              {GRADE_TIER_LABEL[line.gradeTier]} · ×{line.qty}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums text-dark">
                              {formatPrice(line.unitPricePaid * line.qty)}
                            </span>
                            {savings != null ? (
                              <span
                                className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                                  savings >= 0
                                    ? "bg-green-50 text-green-700"
                                    : "bg-amber/10 text-amber"
                                }`}
                                title={
                                  BASELINE_METHOD[b.baselineSource] ?? ""
                                }
                              >
                                {savings >= 0 ? "saved " : "over by "}
                                {formatPrice(Math.abs(savings))}
                                <span className="text-[10px] font-normal opacity-70">
                                  {" "}
                                  ·{" "}
                                  {BASELINE_METHOD[b.baselineSource] ??
                                    b.baselineSource}
                                </span>
                              </span>
                            ) : b.tierChoiceDelta != null ? (
                              <span
                                className="text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-500"
                                title="Different grade tier than the alternative — recorded as a tier choice, not savings"
                              >
                                tier choice · Δ{" "}
                                {formatPrice(Math.abs(b.tierChoiceDelta))}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-300">
                                — no baseline
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400">
                    <ShieldCheck size={12} className="text-teal" />
                    Fulfilled by Conneverse
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
