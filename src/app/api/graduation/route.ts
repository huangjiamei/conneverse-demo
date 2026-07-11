/**
 * /api/graduation — internal graduation dashboard data.
 *
 * GET ?threshold=0.75&minOrders=20
 * → { groups: [{ shopId, category, orders, agreements, agreementRate,
 *                threshold, minOrders, suggestFlip }] }
 *
 * Per shop × category, the advisor-agreement rate with the machine
 * pick. When a group clears the (configurable) threshold over the
 * minimum order count, the dashboard surfaces a "flip to autopilot"
 * suggestion. Flipping only changes the DEFAULT view — the comparison
 * grid stays one click away (decision #8).
 *
 * POST /api/graduation/seed lives in ./seed/route.ts (dev-only) to
 * exercise the dashboard with representative data.
 */

import { NextResponse } from "next/server";
import { withApi } from "@/lib/api/with-api";
import { store } from "@/lib/api/store";

export type GraduationGroup = {
  shopId: string;
  category: string;
  orders: number;
  agreements: number;
  agreementRate: number;
  threshold: number;
  minOrders: number;
  suggestFlip: boolean;
};

export const GET = withApi(async (req) => {
  const params = req.nextUrl.searchParams;
  const threshold = Math.min(
    1,
    Math.max(0, Number(params.get("threshold") ?? 0.75))
  );
  const minOrders = Math.max(1, Number(params.get("minOrders") ?? 20));

  const byGroup = new Map<string, { orders: number; agreements: number }>();
  for (const c of store.listChoices()) {
    // Shop names and categories can contain spaces — JSON-encode the key.
    const key = JSON.stringify([c.shopId, c.category]);
    const g = byGroup.get(key) ?? { orders: 0, agreements: 0 };
    g.orders++;
    if (c.agreement) g.agreements++;
    byGroup.set(key, g);
  }

  const groups: GraduationGroup[] = [...byGroup.entries()].map(
    ([key, g]) => {
      const [shopId, category] = JSON.parse(key) as [string, string];
      const agreementRate = g.orders > 0 ? g.agreements / g.orders : 0;
      return {
        shopId,
        category,
        orders: g.orders,
        agreements: g.agreements,
        agreementRate,
        threshold,
        minOrders,
        suggestFlip: g.orders >= minOrders && agreementRate >= threshold,
      };
    }
  );
  groups.sort((a, b) => b.orders - a.orders);

  return NextResponse.json({ groups });
});
