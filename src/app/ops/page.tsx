"use client";

/**
 * /ops — internal operations console (not linked from the shop UI).
 *
 *   1. Photo curation queue: approve/reject marketplace listing photos.
 *      A photo renders to shops ONLY after approval here — pending and
 *      rejected photos never cross the wire (they can leak seller
 *      identity).
 *   2. Graduation dashboard: per shop × category advisor-agreement rate
 *      with the machine pick. Clearing the threshold (default 75%) over
 *      ≥20 orders surfaces a "flip to autopilot" suggestion. Flipping
 *      changes only the default view — the grid stays one click away.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ImageOff,
  RefreshCcw,
  Sprout,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useShop } from "@/context/ShopContext";
import type { PhotoCurationEntry } from "@/lib/api/store";
import type { GraduationGroup } from "@/app/api/graduation/route";

export default function OpsPage() {
  const { profile, getSourcingMode, setSourcingMode } = useShop();

  const [photos, setPhotos] = useState<PhotoCurationEntry[]>([]);
  const [groups, setGroups] = useState<GraduationGroup[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [ph, gr] = await Promise.all([
        fetch("/api/curation").then((r) => r.json()),
        fetch("/api/graduation").then((r) => r.json()),
      ]);
      setPhotos(ph.photos ?? []);
      setGroups(gr.groups ?? []);
    } catch {
      // leave current state
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function review(id: string, action: "approve" | "reject") {
    await fetch("/api/curation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    refresh();
  }

  async function seed() {
    await fetch("/api/graduation/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId: profile?.shopName ?? "Bay Auto Care",
        category: "Brakes",
        orders: 24,
        agreementRate: 0.79,
      }),
    });
    refresh();
  }

  const pending = photos.filter((p) => p.status === "pending");
  const reviewed = photos.filter((p) => p.status !== "pending");

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="bg-[#1B2838] text-white">
        <div className="max-w-[1000px] mx-auto px-6 h-14 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold tracking-tight">
              Conneverse Ops
            </span>
            <span className="block text-[11px] text-teal -mt-0.5">
              Internal console
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 text-[12px] text-gray-300 hover:text-white transition"
            >
              <RefreshCcw size={13} className={busy ? "animate-spin" : ""} />
              Refresh
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[12px] text-gray-300 hover:text-white transition"
            >
              <ArrowLeft size={13} />
              Back to app
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 py-8 space-y-8">
        {/* ─── Photo curation ─── */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-dark">
            Photo curation queue
          </h2>
          <p className="text-[12px] text-gray-500 mt-0.5 mb-4">
            Marketplace listing photos render to shops only after approval —
            they can leak seller identity (watermarks, packaging, storefront
            branding). Pending and rejected photos never leave the server.
          </p>

          {pending.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <ImageOff size={16} />
              No photos awaiting review. Run a search in the app to enqueue
              marketplace photos.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="border border-gray-200 rounded-lg overflow-hidden"
                >
                  <img
                    src={p.url}
                    alt={p.context}
                    className="w-full h-28 object-cover bg-gray-100"
                  />
                  <div className="p-2">
                    <p
                      className="text-[11px] text-gray-600 truncate"
                      title={p.context}
                    >
                      {p.context}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        onClick={() => review(p.id, "approve")}
                        className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded bg-teal text-white text-[11px] font-medium hover:bg-teal/90"
                      >
                        <CheckCircle2 size={11} />
                        Approve
                      </button>
                      <button
                        onClick={() => review(p.id, "reject")}
                        className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded border border-gray-200 text-gray-600 text-[11px] font-medium hover:bg-gray-50"
                      >
                        <XCircle size={11} />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {reviewed.length > 0 && (
            <p className="mt-3 text-[11px] text-gray-400">
              Reviewed: {reviewed.filter((p) => p.status === "approved").length}{" "}
              approved · {reviewed.filter((p) => p.status === "rejected").length}{" "}
              rejected
            </p>
          )}
        </section>

        {/* ─── Graduation dashboard ─── */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-dark">
                Graduation dashboard
              </h2>
              <p className="text-[12px] text-gray-500 mt-0.5">
                Advisor agreement with the machine pick, per shop × category.
                ≥75% over ≥20 orders earns a flip-to-autopilot suggestion.
              </p>
            </div>
            <button
              onClick={seed}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50 transition"
            >
              <Sprout size={13} />
              Seed demo data
            </button>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No choice records yet. Select parts in copilot mode (or seed demo
              data) to populate.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 pr-4">Shop</th>
                    <th className="text-left py-2 pr-4">Category</th>
                    <th className="text-right py-2 pr-4">Orders</th>
                    <th className="text-right py-2 pr-4">Agreement</th>
                    <th className="text-left py-2 pr-4">Mode</th>
                    <th className="text-left py-2">Suggestion</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const currentMode = getSourcingMode(g.category);
                    const isThisShop = g.shopId === profile?.shopName;
                    return (
                      <tr
                        key={`${g.shopId}|${g.category}`}
                        className="border-b border-gray-50"
                      >
                        <td className="py-2.5 pr-4 text-dark">{g.shopId}</td>
                        <td className="py-2.5 pr-4 text-gray-600">
                          {g.category}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {g.orders}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          <span
                            className={
                              g.agreementRate >= g.threshold
                                ? "text-teal font-semibold"
                                : "text-gray-700"
                            }
                          >
                            {Math.round(g.agreementRate * 100)}%
                          </span>
                          <span className="text-gray-400">
                            {" "}
                            / {Math.round(g.threshold * 100)}%
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                              isThisShop && currentMode === "autopilot"
                                ? "bg-[#1B2838] text-white"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {isThisShop ? currentMode : "copilot"}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {g.suggestFlip ? (
                            isThisShop && currentMode !== "autopilot" ? (
                              <button
                                onClick={() =>
                                  setSourcingMode(g.category, "autopilot")
                                }
                                className="px-3 py-1 rounded-lg bg-teal text-white text-[11px] font-medium hover:bg-teal/90 transition"
                              >
                                Flip to autopilot
                              </button>
                            ) : isThisShop ? (
                              <button
                                onClick={() =>
                                  setSourcingMode(g.category, "copilot")
                                }
                                className="px-3 py-1 rounded-lg border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-50 transition"
                              >
                                Revert to copilot
                              </button>
                            ) : (
                              <span className="text-[11px] text-teal">
                                Ready to flip
                              </span>
                            )
                          ) : (
                            <span className="text-[11px] text-gray-400">
                              {g.orders < g.minOrders
                                ? `${g.minOrders - g.orders} more orders needed`
                                : "Below threshold"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-[11px] text-gray-400">
            Flipping changes only the default results view — the comparison
            grid stays one click away.
          </p>
        </section>
      </main>
    </div>
  );
}
