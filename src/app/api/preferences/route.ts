/**
 * /api/preferences — correction-sheet preference labels.
 *
 * POST { shopId, category, field: "urgency" | "tierPreference", value }
 * GET  — list
 *
 * Every tap on the assumption line's correction sheet lands here — a
 * preference label alongside the override records, feeding the same
 * shop-taste learning pipeline.
 */

import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api/with-api";
import { store, type PreferenceLabel } from "@/lib/api/store";

type Body = Partial<Omit<PreferenceLabel, "id" | "createdAt">>;

export const POST = withApi(async (req) => {
  const body = await readJson<Body>(req);
  if (
    !body.shopId ||
    !body.category ||
    (body.field !== "urgency" && body.field !== "tierPreference") ||
    !body.value
  ) {
    return NextResponse.json(
      {
        error:
          'Body must include { shopId, category, field: "urgency"|"tierPreference", value }',
      },
      { status: 400 }
    );
  }
  const record = store.logPreference(
    {
      shopId: body.shopId,
      category: body.category,
      field: body.field,
      value: body.value,
    },
    new Date().toISOString()
  );
  return NextResponse.json(record, { status: 201 });
});

export const GET = withApi(async () => {
  return NextResponse.json({ preferences: store.listPreferences() });
});
