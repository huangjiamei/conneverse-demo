/**
 * POST /api/optimize
 *
 * Body: { candidates: Offering[], demandContext: DemandContext, make? }
 * → { recommendations: PublicOffer[] }  (the A and B picks)
 *
 * The optimization seam for headless callers that already hold
 * candidates (e.g. a host system with its own supplier feed). Runs the
 * same gates → score optimizer and returns the anonymized picks.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { optimize, type DemandContext } from "@/lib/optimizer";
import { toPublicOffer } from "@/lib/offerings/public-projection";
import type { Offering } from "@/lib/offerings/types";

type Body = {
  candidates?: Offering[];
  demandContext?: Partial<DemandContext>;
  make?: string;
};

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (!Array.isArray(body.candidates)) {
    return NextResponse.json(
      { error: "Body must include candidates: Offering[]" },
      { status: 400 }
    );
  }

  const context: DemandContext = {
    urgency: body.demandContext?.urgency ?? "scheduled",
    qualityFloor: body.demandContext?.qualityFloor ?? 0.65,
  };

  const recommendations = optimize(body.candidates, context);
  const picks = recommendations
    .filter((r) => r.role === "A" || r.role === "B")
    .map((r) => toPublicOffer(r.offering, r.role as "A" | "B", body.make));

  return NextResponse.json({ recommendations: picks });
});
