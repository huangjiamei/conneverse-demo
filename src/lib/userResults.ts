/**
 * User-side result selection (§1).
 *
 * Reuses the already-stored OptimizerResult rankings (prewarm computes all four
 * presets) — NO new backend computation, just a different way to pick what to show.
 *
 * Only verified (candidateLabel === 1) candidates are eligible.
 *
 *   Best value → Budget rank 1
 *   Fastest    → Rush rank 1
 *   alternates → next 3 from the Balanced ranking, minus the heroes
 *
 * Degradations:
 *   - Same item tops both Budget & Rush → one hero badged "Best overall".
 *   - Only one eligible item → single "Best overall", no alternates.
 *   - A preset's top is missing → fall back to the Balanced (eligible) ranking.
 *
 * "Up to 5, fewer if not enough." Only verified AND eligible (not gate-rejected)
 * candidates are ever shown — the pool is never padded with gated or unverified
 * items to reach 5.
 */

export type HeroBadge = "value" | "fast" | "best";

export type UserSelection = {
  heroes: { id: string; badge: HeroBadge }[];
  alternateIds: string[];
};

export function selectUserResults(opts: {
  /** candidateId of verified (label=1) candidates, in a stable order */
  verifiedIds: string[];
  budgetRankByCand: Map<string, number | null>;
  rushRankByCand: Map<string, number | null>;
  balancedRankByCand: Map<string, number | null>;
}): UserSelection {
  const { verifiedIds, budgetRankByCand, rushRankByCand, balancedRankByCand } =
    opts;
  const verified = new Set(verifiedIds);

  const rank1 = (m: Map<string, number | null>): string | null => {
    for (const [id, r] of m) if (r === 1 && verified.has(id)) return id;
    return null;
  };

  // Balanced order = verified candidates with a rank, ascending
  const balOrdered = [...balancedRankByCand]
    .filter(([id, r]) => r != null && verified.has(id))
    .sort((a, b) => (a[1] as number) - (b[1] as number))
    .map(([id]) => id);

  let valueId = rank1(budgetRankByCand);
  let fastId = rank1(rushRankByCand);

  // Fallbacks stay strictly within ELIGIBLE candidates (Balanced-ranked, i.e.
  // verified AND not gate-rejected). Never pad with gated / unverified items —
  // if nothing eligible remains we show fewer, not filler.
  if (!valueId) valueId = balOrdered[0] ?? null;
  if (!fastId) fastId = valueId;

  const heroes: { id: string; badge: HeroBadge }[] = [];
  if (valueId && valueId === fastId) {
    heroes.push({ id: valueId, badge: "best" });
  } else {
    if (valueId) heroes.push({ id: valueId, badge: "value" });
    if (fastId) heroes.push({ id: fastId, badge: "fast" });
  }

  // Alternates: next from the Balanced (eligible) ranking, minus the heroes.
  // Total shown = heroes (1–2) + alternates (≤3) ≤ 5; fewer when eligible pool
  // runs out — no gate-rejected / unverified backfill.
  const heroIds = new Set(heroes.map((h) => h.id));
  const alternateIds = balOrdered
    .filter((id) => !heroIds.has(id))
    .slice(0, 3);

  return { heroes, alternateIds };
}
