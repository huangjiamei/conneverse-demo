"use client";

/**
 * /embed-demo — the demo harness: a fake host shop-management system
 * (UnifiedFlow/PartsTech pattern) with an estimate screen. Each part
 * line has a "Source with Conneverse" button that opens the /embed
 * iframe with the RO context pre-filled and receives the sourced line
 * back via postMessage.
 *
 * This page IS the pitch handed to Tekmetric/Shopmonkey — deliberately
 * styled as a generic blue host SMS, not Conneverse navy/teal, to show
 * the embed adapting to a host theme while guarantee badges stay
 * Conneverse-branded.
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { EmbedQuoteLine } from "@/lib/embed/host-sms-provider";

type RoLine = {
  id: string;
  description: string;
  qty: number;
  partId?: string;
  kind: "part" | "labor";
  laborTotal?: number;
  sourced?: EmbedQuoteLine;
};

const VEHICLE = { year: 2022, make: "Toyota", model: "Camry" };

const INITIAL_LINES: RoLine[] = [
  {
    id: "l1",
    description: "Front brake pad set",
    qty: 1,
    partId: "brake-pad-front",
    kind: "part",
  },
  {
    id: "l2",
    description: "Front brake rotor",
    qty: 2,
    partId: "rotor-front",
    kind: "part",
  },
  {
    id: "l3",
    description: "Labor — brake service (2.0 hr @ $133)",
    qty: 1,
    kind: "labor",
    laborTotal: 266,
  },
];

export default function EmbedDemoPage() {
  const [lines, setLines] = useState<RoLine[]>(INITIAL_LINES);
  const [sourcingLineId, setSourcingLineId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Receive sourced lines back from the embed.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== "conneverse:quote-complete") return;
      // In production the host also verifies e.origin.
      if (e.source !== iframeRef.current?.contentWindow) return;
      const first: EmbedQuoteLine | undefined = e.data.lines?.[0];
      if (!first || !sourcingLineId) return;
      setLines((ls) =>
        ls.map((l) =>
          l.id === sourcingLineId ? { ...l, sourced: first } : l
        )
      );
      setSourcingLineId(null);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sourcingLineId]);

  const activeLine = lines.find((l) => l.id === sourcingLineId);
  const embedSrc = activeLine
    ? `/embed?year=${VEHICLE.year}&make=${VEHICLE.make}&model=${VEHICLE.model}` +
      `&desc=${encodeURIComponent(activeLine.description)}` +
      (activeLine.partId ? `&partId=${activeLine.partId}` : "") +
      `&qty=${activeLine.qty}` +
      // Host theme: slate neutrals + host blue accent. Guarantee badges
      // stay Conneverse teal inside the embed regardless.
      `&bg=%23f1f5f9&accent=%232563eb` +
      `&origin=${encodeURIComponent(window.location.origin)}`
    : null;

  const partsTotal = lines.reduce(
    (s, l) =>
      s + (l.sourced ? l.sourced.unitPrice * l.sourced.qty : 0),
    0
  );
  const laborTotal = lines.reduce((s, l) => s + (l.laborTotal ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Generic host SMS chrome — deliberately NOT Conneverse-branded */}
      <header className="bg-blue-700 text-white">
        <div className="max-w-[900px] mx-auto px-6 h-12 flex items-center justify-between">
          <span className="font-semibold tracking-tight">
            UnifiedFlow SMS{" "}
            <span className="font-normal text-blue-200 text-sm">
              · demo host
            </span>
          </span>
          <span className="text-[12px] text-blue-200">
            Estimates &rsaquo; RO #4821
          </span>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-8">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          {/* RO header */}
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">
                RO #4821 — Sarah Chen
              </p>
              <p className="text-[13px] text-slate-500">
                {VEHICLE.year} {VEHICLE.make} {VEHICLE.model} SE · 48,210 mi ·
                Bay 3
              </p>
            </div>
            <span className="text-[11px] rounded bg-amber-100 text-amber-800 px-2 py-1 font-medium">
              Estimate — awaiting parts
            </span>
          </div>

          {/* Lines */}
          <div className="divide-y divide-slate-100">
            {lines.map((l) => (
              <div
                key={l.id}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {l.description}
                    <span className="text-slate-400 font-normal">
                      {" "}
                      · ×{l.qty}
                    </span>
                  </p>
                  {l.sourced ? (
                    <p className="text-[12px] text-emerald-700 mt-0.5">
                      Sourced ✓ {l.sourced.brand} · {l.sourced.warranty} ·{" "}
                      {l.sourced.delivery} ·{" "}
                      <span className="text-slate-400">
                        {l.sourced.attribution}
                      </span>
                    </p>
                  ) : l.kind === "part" ? (
                    <p className="text-[12px] text-slate-400 mt-0.5">
                      needs part
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">
                    {l.kind === "labor"
                      ? `$${l.laborTotal?.toFixed(2)}`
                      : l.sourced
                      ? `$${(l.sourced.unitPrice * l.sourced.qty).toFixed(2)}`
                      : "—"}
                  </span>
                  {l.kind === "part" && !l.sourced && (
                    <button
                      onClick={() => setSourcingLineId(l.id)}
                      className="px-3 py-1.5 rounded bg-blue-600 text-white text-[12px] font-medium hover:bg-blue-700 transition"
                    >
                      Source with Conneverse
                    </button>
                  )}
                  {l.sourced && (
                    <button
                      onClick={() =>
                        setLines((ls) =>
                          ls.map((x) =>
                            x.id === l.id
                              ? { ...x, sourced: undefined }
                              : x
                          )
                        )
                      }
                      className="text-[11px] text-slate-400 hover:text-slate-600"
                    >
                      re-source
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-5 py-4 border-t border-slate-200 text-sm space-y-1">
            <div className="flex justify-between text-slate-500">
              <span>Parts</span>
              <span className="tabular-nums">${partsTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Labor</span>
              <span className="tabular-nums">${laborTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-base pt-1">
              <span>Estimate total</span>
              <span className="tabular-nums">
                ${(partsTotal + laborTotal).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[12px] text-slate-400">
          This page simulates a host shop-management system. The embed
          contract lives in docs/embed.md.
        </p>
      </main>

      {/* Embed modal */}
      {embedSrc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[920px] h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 h-11 border-b border-slate-200 bg-slate-50">
              <span className="text-[13px] font-medium text-slate-600">
                Sourcing: {activeLine?.description} — {VEHICLE.year}{" "}
                {VEHICLE.make} {VEHICLE.model}
              </span>
              <button
                onClick={() => setSourcingLineId(null)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <iframe
              ref={iframeRef}
              src={embedSrc}
              title="Conneverse sourcing"
              className="flex-1 w-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
