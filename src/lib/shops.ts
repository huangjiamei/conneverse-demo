/**
 * Shop field rules — shared by POST /api/shops and PATCH /api/shops/[id].
 *
 * The whitelist is the security boundary for §5: a SHOP_ADMIN may only touch
 * contact/address fields on their own shop. `name` and `adminUserId` are not in
 * their list, so a hand-crafted request carrying them is silently dropped
 * rather than applied. Only PLATFORM_ADMIN gets `name`.
 *
 * `adminUserId` is never writable through this path at all — changing who runs
 * a shop goes through review.ts so it stays transactional (see §3b).
 */

import type { Prisma, ShopType } from "@prisma/client";

/** Editable by a shop admin on their own shop. */
export const SHOP_ADMIN_FIELDS = [
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "zip",
  "country",
  "type",
] as const;

/** Platform admin additionally owns the shop's identity. */
export const PLATFORM_ADMIN_FIELDS = ["name", ...SHOP_ADMIN_FIELDS] as const;

export type ShopField = (typeof PLATFORM_ADMIN_FIELDS)[number];

const SHOP_TYPES: ShopType[] = ["MECHANICAL", "COLLISION"];

export type ShopFieldErrors = Partial<Record<ShopField, string>>;

export type ParsedShopFields = {
  data: Prisma.ShopUncheckedUpdateInput;
  errors: ShopFieldErrors;
  /** Keys the caller sent but isn't allowed to set — reported, not applied. */
  ignored: string[];
};

/** "" → null so clearing a field actually clears it; trims everything else. */
function normalize(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Pick the fields this role may write, validate them, and report the rest.
 * Only keys actually present in `body` end up in `data`, so PATCH stays partial.
 */
export function parseShopFields(
  body: Record<string, unknown>,
  role: "PLATFORM_ADMIN" | "SHOP_ADMIN"
): ParsedShopFields {
  const allowed: readonly string[] =
    role === "PLATFORM_ADMIN" ? PLATFORM_ADMIN_FIELDS : SHOP_ADMIN_FIELDS;

  const data: Prisma.ShopUncheckedUpdateInput = {};
  const errors: ShopFieldErrors = {};
  const ignored: string[] = [];

  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      ignored.push(key);
      continue;
    }

    const raw = body[key];

    if (key === "name") {
      const name = normalize(raw);
      if (name === undefined) continue;
      if (name === null) {
        errors.name = "Shop name is required.";
        continue;
      }
      data.name = name;
      continue;
    }

    if (key === "type") {
      if (raw === null || raw === "") {
        data.type = null;
        continue;
      }
      if (typeof raw !== "string" || !SHOP_TYPES.includes(raw as ShopType)) {
        errors.type = "Type must be MECHANICAL or COLLISION.";
        continue;
      }
      data.type = raw as ShopType;
      continue;
    }

    const value = normalize(raw);
    if (value === undefined) continue;

    if (key === "state" && value && value.length !== 2) {
      errors.state = "Use the two-letter state code (e.g. CA).";
      continue;
    }
    if (key === "country" && value && value.length > 2) {
      errors.country = "Use the two-letter country code (e.g. US).";
      continue;
    }

    (data as Record<string, unknown>)[key] =
      key === "state" || key === "country" ? value?.toUpperCase() ?? null : value;
  }

  return { data, errors, ignored };
}
