/**
 * GET /api/analytics — the savings ledger rollup.
 *
 * Bookkeeper-auditable by construction:
 *   - Savings = Σ (baselinePrice − pricePaid) × qty, ONLY over lines
 *     with a real baseline (shop_history or market_snapshot). Lines
 *     with baselineSource "none" are excluded from every total.
 *   - Negative deltas (paid above baseline) are included — the ledger
 *     reports what happened, not just the wins.
 *   - Cross-tier deltas are reported separately as tierChoiceDelta —
 *     a spend choice, never savings.
 */

import { NextResponse } from "next/server";
import { withApi } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";
import type { BaselineSource } from "@/types/canonical";

export type AnalyticsSummary = {
  orders: number;
  lines: number;
  totalSpend: number;
  /** Σ (baseline − paid) × qty over baselined lines only. */
  totalSavings: number;
  bySource: Record<
    Exclude<BaselineSource, "none">,
    { lines: number; savings: number }
  >;
  /** Lines with no qualifying baseline — excluded from totals. */
  excludedLines: number;
  /** Σ tierChoiceDelta × qty — tier choices, never counted as savings. */
  tierChoiceDelta: number;
};

export const GET = withApi(async () => {
  const orders = store.listOrders();

  const summary: AnalyticsSummary = {
    orders: orders.length,
    lines: 0,
    totalSpend: 0,
    totalSavings: 0,
    bySource: {
      shop_history: { lines: 0, savings: 0 },
      market_snapshot: { lines: 0, savings: 0 },
    },
    excludedLines: 0,
    tierChoiceDelta: 0,
  };

  for (const order of orders) {
    for (const line of order.lines) {
      summary.lines++;
      summary.totalSpend += line.unitPricePaid * line.qty;

      const b = line.baseline;
      if (b.baselineSource === "none" || b.baselinePrice == null) {
        summary.excludedLines++;
        if (b.tierChoiceDelta != null) {
          summary.tierChoiceDelta += b.tierChoiceDelta * line.qty;
        }
        continue;
      }
      const delta = (b.baselinePrice - line.unitPricePaid) * line.qty;
      summary.totalSavings += delta;
      summary.bySource[b.baselineSource].lines++;
      summary.bySource[b.baselineSource].savings += delta;
    }
  }

  // Round money fields.
  const r = (n: number) => Math.round(n * 100) / 100;
  summary.totalSpend = r(summary.totalSpend);
  summary.totalSavings = r(summary.totalSavings);
  summary.tierChoiceDelta = r(summary.tierChoiceDelta);
  summary.bySource.shop_history.savings = r(
    summary.bySource.shop_history.savings
  );
  summary.bySource.market_snapshot.savings = r(
    summary.bySource.market_snapshot.savings
  );

  return NextResponse.json(summary);
});
