/**
 * eBay Browse API wrapper.
 *
 * Server-only. Uses the cached app token from ebay-auth.ts to call
 * /buy/browse/v1/item_summary/search and returns normalized listings
 * suitable for the parts UI.
 *
 * Docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
 */

import { getEbayAccessToken } from "./ebay-auth.ts";

const BROWSE_SEARCH_URL =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";
const BROWSE_ITEM_URL = "https://api.ebay.com/buy/browse/v1/item";

// ─── Public types ───

export type EbayItem = {
  itemId: string;
  title: string;
  /** Numeric price for easy comparison/sorting. */
  price: number;
  currency: string;
  imageUrl: string | null;
  /** Human-readable condition string from eBay (e.g. "New", "Used"). */
  condition: string | null;
  seller: {
    username: string;
    /** Positive feedback %, 0–100. Null if eBay didn't return it. */
    feedbackPercentage: number | null;
    /** Total feedback count. Null if eBay didn't return it. */
    feedbackScore: number | null;
  };
  /** Web URL for the listing — use this to link customers out. */
  itemUrl: string;
  /** Shipping cost in the listing currency. Null if not provided. */
  shippingCost: number | null;
  /** e.g. "FIXED" or "CALCULATED". Null if not provided. */
  shippingType: string | null;
  /**
   * Earliest estimated delivery date (ISO). Only populated when a
   * buyer location was supplied via `SearchOptions.buyerZip`.
   */
  minDeliveryDate: string | null;
  /** Latest estimated delivery date (ISO). Same caveat as above. */
  maxDeliveryDate: string | null;
  /** Human-readable seller location like "Los Angeles, US". */
  location: string | null;
};

/**
 * Vehicle compatibility aspects. The first three are required by eBay
 * for motor-vehicle parts; trim and engine narrow it further when
 * available.
 */
export type VehicleSpec = {
  year: number | string;
  make: string;
  model: string;
  trim?: string;
  engine?: string;
};

export type SearchOptions = {
  /** Items to return. Default 10. eBay max is 200. */
  limit?: number;
  /** eBay marketplace. Default "EBAY_US". */
  marketplace?: string;
  /**
   * Restrict to specific condition IDs. Common values:
   *   1000 = New
   *   1500 = New other
   *   2000 = Manufacturer refurbished
   *   2500 = Seller refurbished
   *   3000 = Used
   */
  conditionIds?: string[];
  /** Sort order. Omit for eBay's relevance ranking. */
  sort?: "price" | "-price" | "newlyListed" | "endingSoonest";
  /**
   * Buyer ZIP/postal code. When set, eBay populates per-listing
   * shipping cost and `min/maxEstimatedDeliveryDate` based on this
   * location.
   */
  buyerZip?: string;
  /** Buyer country, ISO 3166-1 alpha-2. Default "US". */
  buyerCountry?: string;
  /**
   * Vehicle to restrict results by. Adds eBay's `compatibility_filter`
   * and (by default) limits results to the "Auto Parts & Accessories"
   * category — eBay requires both for the filter to work.
   */
  vehicle?: VehicleSpec;
  /**
   * Explicit category IDs. When `vehicle` is set and this is omitted,
   * defaults to `["6028"]` (Auto Parts & Accessories) so the
   * compatibility filter is accepted.
   */
  categoryIds?: string[];
};

// ─── eBay response shape (only the fields we read) ───

type EbayPrice = { value: string; currency: string };
type EbayImage = { imageUrl: string };
type EbaySeller = {
  username?: string;
  feedbackPercentage?: string;
  feedbackScore?: number;
};
type EbayShippingOption = {
  shippingCost?: EbayPrice;
  shippingCostType?: string;
  minEstimatedDeliveryDate?: string;
  maxEstimatedDeliveryDate?: string;
};
type EbayItemLocation = {
  country?: string;
  postalCode?: string;
  city?: string;
};
type EbayItemSummary = {
  itemId: string;
  title: string;
  price?: EbayPrice;
  image?: EbayImage;
  thumbnailImages?: EbayImage[];
  seller?: EbaySeller;
  condition?: string;
  itemWebUrl: string;
  shippingOptions?: EbayShippingOption[];
  itemLocation?: EbayItemLocation;
};
type EbaySearchResponse = {
  total?: number;
  limit?: number;
  offset?: number;
  itemSummaries?: EbayItemSummary[];
};

// ─── Helpers ───

function toNumber(value: string | undefined | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(item: EbayItemSummary): EbayItem {
  const ship = item.shippingOptions?.[0];
  const loc = item.itemLocation;
  const locParts = [loc?.city, loc?.country].filter(Boolean) as string[];

  return {
    itemId: item.itemId,
    title: item.title,
    price: toNumber(item.price?.value) ?? 0,
    currency: item.price?.currency ?? "USD",
    imageUrl:
      item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl ?? null,
    condition: item.condition ?? null,
    seller: {
      username: item.seller?.username ?? "",
      feedbackPercentage: toNumber(item.seller?.feedbackPercentage),
      feedbackScore: item.seller?.feedbackScore ?? null,
    },
    itemUrl: item.itemWebUrl,
    shippingCost: toNumber(ship?.shippingCost?.value),
    shippingType: ship?.shippingCostType ?? null,
    minDeliveryDate: ship?.minEstimatedDeliveryDate ?? null,
    maxDeliveryDate: ship?.maxEstimatedDeliveryDate ?? null,
    location: locParts.length > 0 ? locParts.join(", ") : null,
  };
}

function buildCompatibilityFilter(v: VehicleSpec): string {
  const parts = [
    `Year:${v.year}`,
    `Make:${v.make}`,
    `Model:${v.model}`,
  ];
  if (v.trim) parts.push(`Trim:${v.trim}`);
  if (v.engine) parts.push(`Engine:${v.engine}`);
  return parts.join(";");
}

// ─── Public API ───

/**
 * Searches the live eBay marketplace and returns normalized listings.
 * Throws on empty query, missing credentials, or eBay error responses.
 */
export async function searchEbayParts(
  query: string,
  options: SearchOptions = {}
): Promise<EbayItem[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("searchEbayParts: query must not be empty");
  }

  const limit = options.limit ?? 10;
  const marketplace = options.marketplace ?? "EBAY_US";
  const token = await getEbayAccessToken();

  const params = new URLSearchParams({
    q: trimmed,
    limit: String(limit),
  });
  if (options.sort) {
    params.set("sort", options.sort);
  }
  if (options.conditionIds && options.conditionIds.length > 0) {
    // eBay filter syntax: filter=conditionIds:{1000|1500}
    params.set(
      "filter",
      `conditionIds:{${options.conditionIds.join("|")}}`
    );
  }

  // Vehicle compatibility — eBay requires both compatibility_filter and
  // a fitment-enabled category. Despite what eBay's docs say, the
  // common "Auto Parts" IDs (6028, 33707, 33567) all reject the filter
  // with errorId 12506. Category 33559 ("Auto Parts & Accessories"
  // parent in eBay Motors) does accept it and returns ~8k results for
  // typical brake-pad searches. See src/lib/test-ebay-compat-cats.ts
  // for the probe script that established this.
  if (options.vehicle) {
    params.set(
      "compatibility_filter",
      buildCompatibilityFilter(options.vehicle)
    );
    const categoryIds = options.categoryIds ?? ["33559"];
    params.set("category_ids", categoryIds.join(","));
  } else if (options.categoryIds && options.categoryIds.length > 0) {
    params.set("category_ids", options.categoryIds.join(","));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": marketplace,
    Accept: "application/json",
  };

  // Buyer location context — unlocks per-listing delivery dates and
  // accurate calculated-shipping costs.
  if (options.buyerZip) {
    const country = options.buyerCountry ?? "US";
    headers["X-EBAY-C-ENDUSERCTX"] =
      `contextualLocation=country=${country},zip=${options.buyerZip}`;
  }

  const url = `${BROWSE_SEARCH_URL}?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `eBay search failed (${res.status} ${res.statusText}): ${errBody}`
    );
  }

  const data = (await res.json()) as EbaySearchResponse;
  return (data.itemSummaries ?? []).map(normalize);
}

// ─── Item aspects (for OE-number consensus) ─────────────────────────

export type EbayAspect = { name: string; value: string };

type EbayItemDetail = {
  mpn?: string;
  brand?: string;
  localizedAspects?: Array<{ type?: string; name?: string; value?: string }>;
};

/**
 * Fetch an item's detail and return its aspects (the OE/MPN/Interchange
 * part-number fields live here, not in the search summary). `mpn` and
 * `brand`, when present at the top level, are surfaced as synthetic
 * aspects. One Browse getItem call per item — the caller bounds how many
 * it fetches to respect rate limits.
 */
export async function getEbayItemAspects(
  itemId: string,
  marketplace = "EBAY_US"
): Promise<EbayAspect[]> {
  const token = await getEbayAccessToken();
  const url = `${BROWSE_ITEM_URL}/${encodeURIComponent(itemId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplace,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(
      `eBay getItem failed (${res.status} ${res.statusText})`
    );
  }
  const data = (await res.json()) as EbayItemDetail;
  const aspects: EbayAspect[] = [];
  if (data.mpn) aspects.push({ name: "Manufacturer Part Number", value: data.mpn });
  if (data.brand) aspects.push({ name: "Brand", value: data.brand });
  for (const a of data.localizedAspects ?? []) {
    if (a.name && a.value) aspects.push({ name: a.name, value: a.value });
  }
  return aspects;
}
