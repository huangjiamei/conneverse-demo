"use client";

/**
 * /orders — the orders board.
 *
 * Each order card carries the PartTracker (verified-carrier milestones,
 * bay-planning ETA, last scan), the savings chips, per-line claims
 * (Report a problem → instant resolution → claim mini-tracker), and a
 * working same-day swap on delayed orders. on_lift orders sort first
 * and get the loudest delay treatment.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  FileDown,
  Flame,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useShop } from "@/context/ShopContext";
import { formatPrice } from "@/lib/format";
import {
  ClaimFlow,
  ClaimTracker,
} from "@/components/orders/ClaimFlow";
import {
  PartTracker,
  isOrderDelayed,
} from "@/components/orders/PartTracker";
import { SHOP_CONFIG } from "@/data/shop-config";
import type {
  ClaimStatus,
  OrderStatus,
  PublicClaim,
  PublicOffer,
  PublicOrder,
  TrackerStage,
} from "@/types/canonical";
import { GRADE_TIER_LABEL } from "@/types/canonical";

const BASELINE_METHOD: Record<string, string> = {
  shop_history: "vs. your avg paid price",
  market_snapshot: "vs. same-search alternative",
};

const STAGE_LABEL: Record<TrackerStage, string> = {
  ordered: "ordered",
  confirmed: "confirmed",
  in_transit: "in transit",
  out_for_delivery: "out for delivery",
  delivered: "delivered",
};

// Demo scan locations keyed by stage (a real carrier feed provides these).
const SCAN_LOCATION: Partial<Record<TrackerStage, string>> = {
  in_transit: "Oakland, CA",
  out_for_delivery: "San Francisco, CA",
};

function deliveredAt(order: PublicOrder): string | null {
  return (
    order.carrierEvents.findLast((e) => e.stage === "delivered")?.at ??
    order.statusHistory.findLast((h) => h.status === "delivered")?.at ??
    null
  );
}

function returnWindowDay(order: PublicOrder): number | null {
  const d = deliveredAt(order);
  if (!d) return null;
  const days =
    Math.floor(
      (Date.now() - new Date(d).getTime()) / (24 * 60 * 60 * 1000)
    ) + 1;
  return Math.min(days, SHOP_CONFIG.returnWindowDays);
}

type SwapState = {
  orderId: string;
  loading: boolean;
  offer: PublicOffer | null;
  paid: number;
  message: string | null;
};

export default function OrdersPage() {
  const { profile } = useShop();
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [claims, setClaims] = useState<PublicClaim[]>([]);
  const [busy, setBusy] = useState(false);
  const [claimFor, setClaimFor] = useState<{
    orderId: string;
    lineId: string;
  } | null>(null);
  const [swap, setSwap] = useState<SwapState | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [o, c] = await Promise.all([
        fetch("/api/orders").then((r) => r.json()),
        fetch("/api/claims").then((r) => r.json()),
      ]);
      setOrders(o.orders ?? []);
      setClaims(c.claims ?? []);
    } catch {
      // keep current
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // on_lift first, then delayed, then newest.
  const sorted = useMemo(() => {
    return [...orders].sort((a, b) => {
      const lift = Number(b.urgency === "on_lift") - Number(a.urgency === "on_lift");
      if (lift !== 0) return lift;
      const delay = Number(isOrderDelayed(b)) - Number(isOrderDelayed(a));
      if (delay !== 0) return delay;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [orders]);

  const claimsByLine = useMemo(() => {
    const map = new Map<string, PublicClaim[]>();
    for (const c of claims) {
      const key = `${c.orderId}|${c.lineId}`;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
  }, [claims]);

  async function trackStage(order: PublicOrder, stage: TrackerStage) {
    await fetch("/api/orders/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        stage,
        location: SCAN_LOCATION[stage],
      }),
    });
    refresh();
  }

  async function setStatus(orderId: string, status: OrderStatus, note?: string) {
    await fetch("/api/orders/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status, note }),
    });
    refresh();
  }

  async function advanceClaim(claimId: string, status: ClaimStatus) {
    await fetch("/api/claims/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId, status }),
    });
    refresh();
  }

  async function findSwap(order: PublicOrder) {
    const line = order.lines.find((l) => l.catalogPartId);
    if (!line) return;
    setSwap({
      orderId: order.id,
      loading: true,
      offer: null,
      paid: line.unitPricePaid,
      message: null,
    });
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle: order.vehicle,
          partRequest: { partId: line.catalogPartId },
          zip: profile?.zipCode,
        }),
      });
      const data = await res.json();
      const candidates: PublicOffer[] = data.candidates ?? [];
      // In-stock faster options only: same-day first, else next-day.
      const fast =
        candidates.filter((c) => c.deliveryEstimate.days === 0)[0] ??
        candidates.filter((c) => c.deliveryEstimate.days <= 1)[0] ??
        null;
      setSwap({
        orderId: order.id,
        loading: false,
        offer: fast,
        paid: line.unitPricePaid,
        message: fast ? null : "No faster in-stock alternative right now.",
      });
    } catch {
      setSwap({
        orderId: order.id,
        loading: false,
        offer: null,
        paid: line.unitPricePaid,
        message: "Search failed — try again.",
      });
    }
  }

  async function doSwap(order: PublicOrder, offer: PublicOffer) {
    const line = order.lines.find((l) => l.catalogPartId)!;
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId: order.shopId,
        vehicle: order.vehicle,
        urgency: order.urgency,
        lines: [
          {
            offerId: offer.id,
            catalogPartId: line.catalogPartId,
            partName: line.partName,
            partNumber: line.partNumber,
            brand: offer.brand,
            gradeTier: offer.gradeTier,
            condition: offer.condition,
            qty: line.qty,
            unitPrice: offer.price,
            deliveryDays: offer.deliveryEstimate.days,
            marketBaseline: offer.marketBaseline,
          },
        ],
      }),
    });
    await setStatus(
      order.id,
      "exception",
      "Swapped to a faster alternative"
    );
    setSwap(null);
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
        {sorted.length === 0 ? (
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
          sorted.map((order) => {
            const delayed = isOrderDelayed(order);
            const exception = order.status === "exception";
            const onLift = order.urgency === "on_lift";
            const alarm = delayed || exception;
            const loud = alarm && onLift;
            const reached = new Set(order.carrierEvents.map((e) => e.stage));
            const nextStage = order.supportedStages.find(
              (s) => !reached.has(s)
            );
            const windowDay = returnWindowDay(order);
            const canClaim =
              order.status === "delivered" || order.status === "installed";
            const swapHere = swap?.orderId === order.id ? swap : null;

            return (
              <div
                key={order.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                  loud
                    ? "border-red-400 ring-2 ring-red-200"
                    : alarm
                    ? "border-red-300"
                    : "border-gray-200"
                }`}
              >
                {alarm && (
                  <div
                    className={`px-5 py-2 flex items-center gap-2 border-b ${
                      loud
                        ? "bg-red-100 border-red-200"
                        : "bg-red-50 border-red-100"
                    }`}
                  >
                    <AlertTriangle size={14} className="text-red-600" />
                    <span className="text-[12px] font-semibold text-red-700">
                      {exception
                        ? `Exception — ${order.statusHistory.at(-1)?.note ?? "needs attention"}`
                        : `Delayed — promised ${new Date(order.etaDate).toLocaleDateString("en-US")}`}
                      {onLift && " · CAR ON LIFT"}
                    </span>
                    {delayed && !exception && (
                      <button
                        onClick={() => findSwap(order)}
                        className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 text-white text-[11px] font-medium hover:bg-red-700 transition"
                      >
                        <Zap size={11} />
                        Find same-day swap
                      </button>
                    )}
                  </div>
                )}

                {/* Swap panel */}
                {swapHere && (
                  <div className="px-5 py-3 bg-teal/5 border-b border-teal/15 text-[12px]">
                    {swapHere.loading ? (
                      <span className="text-gray-500">
                        Searching in-stock faster options…
                      </span>
                    ) : swapHere.offer ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-dark">
                          Same-day alternative:{" "}
                          <strong>{swapHere.offer.brand ?? "Unbranded"}</strong>{" "}
                          · {formatPrice(swapHere.offer.price)}
                          {swapHere.offer.price > swapHere.paid && (
                            <span className="text-gray-500">
                              {" "}
                              (+
                              {formatPrice(
                                swapHere.offer.price - swapHere.paid
                              )}{" "}
                              more)
                            </span>
                          )}{" "}
                          · {swapHere.offer.deliveryEstimate.label}
                        </span>
                        <button
                          onClick={() => doSwap(order, swapHere.offer!)}
                          className="px-3 py-1 rounded bg-teal text-white text-[11px] font-medium hover:bg-teal/90"
                        >
                          Swap part
                        </button>
                        <button
                          onClick={() => setSwap(null)}
                          className="text-gray-400 hover:text-gray-600 text-[11px]"
                        >
                          dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-500">
                        {swapHere.message}
                        <button
                          onClick={() => setSwap(null)}
                          className="ml-2 text-gray-400 hover:text-gray-600"
                        >
                          dismiss
                        </button>
                      </span>
                    )}
                  </div>
                )}

                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-dark flex items-center gap-2">
                        {order.vehicle.year} {order.vehicle.make}{" "}
                        {order.vehicle.model}
                        {onLift && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-bold uppercase">
                            <Flame size={9} />
                            On lift
                          </span>
                        )}
                        <span className="text-[11px] font-normal text-gray-400">
                          {order.id} ·{" "}
                          {new Date(order.createdAt).toLocaleDateString(
                            "en-US"
                          )}
                        </span>
                      </p>
                      <div className="mt-2">
                        <PartTracker order={order} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {nextStage && !exception && (
                        <button
                          onClick={() => trackStage(order, nextStage)}
                          className="px-3 py-1.5 rounded-lg bg-teal text-white text-[11px] font-medium hover:bg-teal/90 transition"
                        >
                          Carrier: {STAGE_LABEL[nextStage]}
                        </button>
                      )}
                      {order.status === "delivered" && (
                        <button
                          onClick={() => setStatus(order.id, "installed")}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[11px] font-medium hover:bg-gray-50 transition"
                        >
                          Mark installed
                        </button>
                      )}
                      {!exception &&
                        order.status !== "installed" &&
                        order.status !== "delivered" && (
                          <button
                            onClick={() =>
                              setStatus(order.id, "exception")
                            }
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
                        onClick={async () => {
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
                          });
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[11px] font-medium hover:bg-gray-50 transition"
                      >
                        <FileDown size={12} />
                        PO
                      </button>
                    </div>
                  </div>

                  {/* Lines: savings + claims */}
                  <div className="mt-4 border-t border-gray-100 pt-3 space-y-2">
                    {order.lines.map((line) => {
                      const b = line.baseline;
                      const savings =
                        b.baselinePrice != null
                          ? (b.baselinePrice - line.unitPricePaid) * line.qty
                          : null;
                      const lineClaims =
                        claimsByLine.get(`${order.id}|${line.id}`) ?? [];
                      const claimOpen =
                        claimFor?.orderId === order.id &&
                        claimFor?.lineId === line.id;
                      return (
                        <div key={line.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                            <div className="min-w-0">
                              <span className="font-medium text-dark">
                                {line.partName}
                              </span>{" "}
                              <span className="text-gray-400">
                                · {line.brand} ·{" "}
                                {GRADE_TIER_LABEL[line.gradeTier]} · ×
                                {line.qty}
                              </span>
                              {canClaim && windowDay != null && (
                                <span className="ml-2 text-[10px] rounded-full bg-gray-100 text-gray-500 px-2 py-0.5">
                                  day {windowDay} of{" "}
                                  {SHOP_CONFIG.returnWindowDays}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="tabular-nums text-dark">
                                {formatPrice(
                                  line.unitPricePaid * line.qty
                                )}
                              </span>
                              {savings != null ? (
                                <span
                                  className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                                    savings >= 0
                                      ? "bg-green-50 text-green-700"
                                      : "bg-amber/10 text-amber"
                                  }`}
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
                                <span className="text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">
                                  tier choice · Δ{" "}
                                  {formatPrice(
                                    Math.abs(b.tierChoiceDelta)
                                  )}
                                </span>
                              ) : (
                                <span className="text-[11px] text-gray-300">
                                  — no baseline
                                </span>
                              )}
                              {canClaim && lineClaims.length === 0 && (
                                <button
                                  onClick={() =>
                                    setClaimFor(
                                      claimOpen
                                        ? null
                                        : {
                                            orderId: order.id,
                                            lineId: line.id,
                                          }
                                    )
                                  }
                                  className="text-[11px] text-gray-400 hover:text-red-600 underline-offset-2 hover:underline transition"
                                >
                                  Report a problem
                                </button>
                              )}
                            </div>
                          </div>

                          {claimOpen && (
                            <ClaimFlow
                              order={order}
                              line={line}
                              onCancel={() => setClaimFor(null)}
                              onDone={() => {
                                setClaimFor(null);
                                refresh();
                              }}
                            />
                          )}

                          {lineClaims.map((c) => (
                            <ClaimTracker
                              key={c.id}
                              claim={c}
                              onAdvance={advanceClaim}
                            />
                          ))}
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
