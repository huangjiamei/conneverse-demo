"use client";

/**
 * /analytics — the savings ledger. The continuously-proven "$79k"
 * story, built to survive the shop's own bookkeeper:
 *
 *   - Every metric card sublabels its methodology.
 *   - Totals include ONLY lines with a real like-for-like baseline
 *     (shop history or same-search market snapshot).
 *   - Cross-tier deltas are shown separately as tier choices, never
 *     mixed into savings.
 *   - Lines with no baseline are counted and excluded, visibly.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileSpreadsheet,
  PiggyBank,
  RefreshCcw,
  Scale,
  SlidersHorizontal,
} from "lucide-react";
import { useShop } from "@/context/ShopContext";
import { formatPrice } from "@/lib/format";
import type { AnalyticsSummary } from "@/app/api/analytics/route";

const SAMPLE_CSV = `date,oe_number,description,brand,qty,unit_price
2026-05-02,CBP-7301,Front brake pads,Wagner,2,61.20
2026-06-11,CBP-7301,Front brake pads,Wagner,1,58.90
2026-04-19,CTH-2201,Thermostat,Motorad,1,31.40`;

export default function AnalyticsPage() {
  const { profile } = useShop();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [csv, setCsv] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [a, h] = await Promise.all([
        fetch("/api/analytics").then((r) => r.json()),
        fetch("/api/shop-history").then((r) => r.json()),
      ]);
      setSummary(a);
      setHistoryCount(h.count ?? 0);
    } catch {
      // keep current
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function importCsv() {
    const body = csv.trim() || SAMPLE_CSV;
    const res = await fetch("/api/shop-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: body }),
    });
    const data = await res.json();
    setImportMsg(
      res.ok
        ? `Imported ${data.imported} rows (${data.skipped} skipped) — ${data.total} total`
        : data?.error ?? "Import failed"
    );
    refresh();
  }

  const s = summary;

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="bg-[#1B2838] text-white">
        <div className="max-w-[1000px] mx-auto px-6 h-14 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold tracking-tight">
              Savings ledger
            </span>
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
              href="/orders"
              className="text-[12px] text-gray-300 hover:text-white transition"
            >
              Orders
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

      <main className="max-w-[1000px] mx-auto px-6 py-8 space-y-6">
        {/* Headline cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 text-teal">
              <PiggyBank size={16} />
              <span className="text-[11px] font-bold uppercase tracking-wide">
                Cumulative savings
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold text-[#1B2838] tabular-nums">
              {s ? formatPrice(s.totalSavings) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              vs. like-for-like baselines only · lines without a baseline
              excluded ({s?.excludedLines ?? 0} excluded)
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 text-gray-500">
              <Scale size={16} />
              <span className="text-[11px] font-bold uppercase tracking-wide">
                Total parts spend
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold text-[#1B2838] tabular-nums">
              {s ? formatPrice(s.totalSpend) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              {s?.orders ?? 0} orders · {s?.lines ?? 0} lines · all Conneverse
              orders
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 text-gray-500">
              <SlidersHorizontal size={16} />
              <span className="text-[11px] font-bold uppercase tracking-wide">
                Tier choices
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold text-[#1B2838] tabular-nums">
              {s ? formatPrice(Math.abs(s.tierChoiceDelta)) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              cross-tier deltas — a quality choice, never counted as savings
            </p>
          </div>
        </div>

        {/* Source breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-dark mb-1">
            Where the baseline comes from
          </h2>
          <p className="text-[12px] text-gray-500 mb-4">
            Strict hierarchy: your own paid prices first, then the
            same-search market alternative. No baseline &rarr; excluded.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark">Shop history</p>
                <p className="text-[11px] text-gray-400">
                  vs. your avg paid price for the same OE number (≤6 months
                  old) · {historyCount} history rows imported
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-dark">
                  {s ? formatPrice(s.bySource.shop_history.savings) : "—"}
                </p>
                <p className="text-[11px] text-gray-400">
                  {s?.bySource.shop_history.lines ?? 0} lines
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div>
                <p className="text-sm font-medium text-dark">
                  Market snapshot
                </p>
                <p className="text-[11px] text-gray-400">
                  vs. the incumbent-channel price for the same part, tier, and
                  condition — captured in the same search
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-dark">
                  {s ? formatPrice(s.bySource.market_snapshot.savings) : "—"}
                </p>
                <p className="text-[11px] text-gray-400">
                  {s?.bySource.market_snapshot.lines ?? 0} lines
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Shop-history import */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-gray-500" />
            <h2 className="text-base font-bold text-dark">
              Import your parts history
            </h2>
          </div>
          <p className="text-[12px] text-gray-500 mt-1 mb-3">
            Paste rows from your Parts Daily Report export
            (date,oe_number,description,brand,qty,unit_price). This unlocks
            the strongest baseline: your own paid prices.
          </p>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={SAMPLE_CSV}
            rows={4}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={importCsv}
              className="px-4 py-2 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal/90 transition"
            >
              Import{csv.trim() ? "" : " sample data"}
            </button>
            {importMsg && (
              <span className="text-[11px] text-gray-500">{importMsg}</span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
