"use client";

/**
 * PartTracker — horizontal milestone tracker for one order.
 *
 * - Max 5 stages (Ordered → Confirmed → In transit → Out for delivery →
 *   Delivered), but ONLY the stages this order's source actually
 *   reports (order.supportedStages) are rendered — a 3-stage carrier
 *   feed renders 3 columns. Stages derive exclusively from verified
 *   carrier events; nothing is interpolated or faked.
 * - ETA is the hero, phrased for bay planning ("Tomorrow, 10 am – 12 pm").
 * - Last carrier scan (time + city) shown for credibility.
 * - Delay state: past-ETA flips to danger styling and the current stage
 *   gets an alert marker. The swap action lives with the parent card.
 */

import { AlertTriangle, Check, MapPin } from "lucide-react";
import type { PublicOrder, TrackerStage } from "@/types/canonical";

const STAGE_LABEL: Record<TrackerStage, string> = {
  ordered: "Ordered",
  confirmed: "Confirmed",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

/** Bay-planning phrase for the promised ETA. The delivery window is a
 * fixed default until carriers provide a real one. */
export function bayEta(etaIso: string): string {
  const eta = new Date(etaIso);
  const now = new Date();
  const sod = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((sod(eta) - sod(now)) / 86_400_000);
  const window = "10 am – 12 pm";
  if (dayDiff <= 0) return `Today, ${window}`;
  if (dayDiff === 1) return `Tomorrow, ${window}`;
  return `${eta.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })}, ${window}`;
}

export function isOrderDelayed(order: PublicOrder): boolean {
  if (order.status === "delivered" || order.status === "installed") {
    return false;
  }
  return Date.now() > new Date(order.etaDate).getTime();
}

export function PartTracker({ order }: { order: PublicOrder }) {
  const stages = order.supportedStages;
  const reached = new Set(order.carrierEvents.map((e) => e.stage));
  // Current = the furthest reached stage, by scale order.
  let currentIdx = -1;
  stages.forEach((s, i) => {
    if (reached.has(s)) currentIdx = i;
  });

  const delivered = reached.has("delivered");
  const delayed = isOrderDelayed(order);

  const lastScan = [...order.carrierEvents]
    .reverse()
    .find((e) => e.location);

  return (
    <div>
      {/* ETA hero */}
      <p
        className={`text-lg font-bold ${
          delayed ? "text-red-600" : "text-dark"
        }`}
      >
        {delivered
          ? `Delivered ${new Date(
              order.carrierEvents.findLast((e) => e.stage === "delivered")
                ?.at ?? order.etaDate
            ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : bayEta(order.etaDate)}
      </p>
      {lastScan && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
          <MapPin size={10} />
          Last scan: {lastScan.location} ·{" "}
          {new Date(lastScan.at).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}

      {/* Milestones — exactly the stages the source supports */}
      <div className="mt-2.5 flex items-center gap-1 flex-wrap">
        {stages.map((s, i) => {
          const hit = reached.has(s);
          const isCurrent = i === currentIdx;
          const alarmHere = delayed && isCurrent && !delivered;
          return (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  alarmHere
                    ? "bg-red-100 text-red-700 ring-1 ring-red-300"
                    : hit
                    ? "bg-teal/10 text-teal"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {alarmHere ? (
                  <AlertTriangle size={9} />
                ) : (
                  hit && <Check size={9} />
                )}
                {STAGE_LABEL[s]}
              </div>
              {i < stages.length - 1 && (
                <div
                  className={`w-4 h-px ${
                    i < currentIdx ? "bg-teal/40" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      {stages.length < 5 && (
        <p className="mt-1 text-[10px] text-gray-300">
          This carrier reports {stages.length} of 5 milestones — nothing is
          interpolated.
        </p>
      )}
    </div>
  );
}
