/**
 * Persistence layer. `DataStore` is the interface the routes depend on;
 * `InMemoryStore` is the demo implementation. Swap in a DB-backed
 * implementation (Prompt 1's "interface for a real DB later") without
 * touching the routes.
 *
 * NOTE: in-memory state resets on every serverless cold start and is
 * not shared across instances. Fine for the demo; production needs a
 * real database.
 */

import { createHash } from "crypto";
import type {
  OrderStatus,
  PurchaseOrder,
  QuoteRecord,
  Vehicle,
} from "@/types/canonical";

// ─── Shop history (savings baseline #1) ─────────────────────────────
//
// The shop's own paid prices, imported from a CSV shaped like their
// Parts Daily Report. Entries older than 6 months are staleness-decayed
// (excluded from baseline computation).

export type ShopHistoryEntry = {
  id: string;
  date: string; // ISO
  oeNumber: string;
  description: string;
  brand: string;
  qty: number;
  unitPrice: number;
};

export type ShopHistoryBaseline = {
  avgPrice: number;
  entries: number;
  latest: string;
};

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

/** Normalize an OE number for history joins (same rule as the OE
 * resolver): uppercase, strip separators. */
export function normalizeOeKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * One confirmed (freeText → partType) pair — future training data for
 * the resolver. Written when the user clicks ✓ on the confirm chip.
 */
export type ResolutionLogEntry = {
  id: string;
  createdAt: string;
  freeText: string;
  vehicle: Vehicle;
  taxonomyId: string;
  partType: string;
  position: string | null;
  partId: string | null;
  source: "deterministic" | "llm";
};

/**
 * One consensus OE number resolved from marketplace listings. Structural
 * shape (kept here to avoid a store↔oe-resolver import cycle).
 */
export type OeConsensusItem = {
  oeNumber: string;
  sellerCount: number;
  confidence: number;
};

/** A persisted consensus result for one (platform, partType, position). */
export type OeConsensusRecord = {
  key: string;
  createdAt: string;
  results: OeConsensusItem[];
};

// ─── Photo curation (copilot media rules) ───────────────────────────
//
// Listing photos can leak seller identity (watermarks, packaging,
// storefront branding), so every marketplace photo passes an internal
// approve/reject queue before it may render. Pending/rejected photos
// NEVER cross the wire.

export type PhotoCurationStatus = "pending" | "approved" | "rejected";

export type PhotoCurationEntry = {
  /** Stable id derived from the photo URL. */
  id: string;
  url: string;
  /** What the photo claims to show (part name), for the reviewer. */
  context: string;
  status: PhotoCurationStatus;
  createdAt: string;
  reviewedAt: string | null;
};

// ─── Choice capture (copilot label streams) ─────────────────────────
//
// Every copilot selection writes one ChoiceRecord — the override-record
// store. Two label streams ride on it: `choiceReason` (shop-preference
// training) and per-candidate `whyNot` chips for expanded-but-unselected
// candidates (quality/fitment training). Implicit signals (expands,
// photo opens, dwell) are logged alongside.

export type WhyNotLabel = {
  offerId: string;
  reason: string;
};

export type ChoiceRecord = {
  id: string;
  createdAt: string;
  shopId: string;
  category: string;
  partId: string;
  /** Opaque public id of the offer the advisor selected. */
  pickedOfferId: string;
  /** Role of the picked offer at selection time. */
  pickedRole: "A" | "B" | "candidate";
  /** Opaque id of the machine's primary (A) pick, when there was one. */
  recommendedOfferId: string | null;
  /** True when the advisor took a machine pick (A or B) — the
   * agreement metric that drives graduation. An override is !agreement. */
  agreement: boolean;
  /** One-tap reason chip ("better brand", "faster", …), optional. */
  choiceReason: string | null;
  /** Optional free text. Never required. */
  freeText: string | null;
  /** Why-not chips for candidates the advisor expanded but passed on. */
  whyNot: WhyNotLabel[];
  // Implicit signals
  expandedOfferIds: string[];
  photoOpens: number;
  dwellMs: number;
};

export interface DataStore {
  createQuote(quote: Omit<QuoteRecord, "id" | "createdAt">, now: string): QuoteRecord;
  getQuote(id: string): QuoteRecord | null;
  listQuotes(): QuoteRecord[];

  createOrder(order: Omit<PurchaseOrder, "id" | "createdAt">, now: string): PurchaseOrder;
  getOrder(id: string): PurchaseOrder | null;
  listOrders(): PurchaseOrder[];
  /** Append a status transition — the seam both manual ops updates and
   * future carrier/supplier webhooks call. Null on unknown order. */
  applyOrderStatus(
    orderId: string,
    status: OrderStatus,
    now: string,
    note?: string
  ): PurchaseOrder | null;

  /** Opaque public offer id → server-side seller identity, written at
   * projection time so order placement can group lines per supplier
   * without ever exposing the seller to the client. */
  registerOffer(opaqueId: string, sellerId: string, channel: string): void;
  lookupOffer(opaqueId: string): { sellerId: string; channel: string } | null;

  /** Shop-history import + baseline lookup (staleness-decayed). */
  importShopHistory(
    entries: Array<Omit<ShopHistoryEntry, "id">>
  ): number;
  getShopHistoryBaseline(
    oeNumber: string,
    now: string
  ): ShopHistoryBaseline | null;
  countShopHistory(): number;

  logResolution(
    entry: Omit<ResolutionLogEntry, "id" | "createdAt">,
    now: string
  ): ResolutionLogEntry;
  listResolutions(): ResolutionLogEntry[];

  /** Consensus OE table — compounds with usage. Null on cache miss. */
  getOeConsensus(key: string): OeConsensusItem[] | null;
  saveOeConsensus(key: string, results: OeConsensusItem[], now: string): void;
  listOeConsensus(): OeConsensusRecord[];

  /** Photo curation queue. `ensurePhoto` enqueues unseen URLs as
   * pending and returns the current status. */
  ensurePhoto(url: string, context: string, now: string): PhotoCurationEntry;
  reviewPhoto(
    id: string,
    status: "approved" | "rejected",
    now: string
  ): PhotoCurationEntry | null;
  listPhotos(status?: PhotoCurationStatus): PhotoCurationEntry[];

  /** Choice / override records (copilot label streams). */
  logChoice(
    record: Omit<ChoiceRecord, "id" | "createdAt">,
    now: string
  ): ChoiceRecord;
  listChoices(): ChoiceRecord[];
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  const hash = createHash("sha256")
    .update(`${prefix}:${counter}`)
    .digest("base64url")
    .slice(0, 8);
  return `${prefix}_${hash}`;
}

class InMemoryStore implements DataStore {
  private quotes = new Map<string, QuoteRecord>();
  private orders = new Map<string, PurchaseOrder>();
  private resolutions: ResolutionLogEntry[] = [];
  private oeConsensus = new Map<string, OeConsensusRecord>();
  private photos = new Map<string, PhotoCurationEntry>();
  private choices: ChoiceRecord[] = [];
  private offerIndex = new Map<string, { sellerId: string; channel: string }>();
  private shopHistory: ShopHistoryEntry[] = [];

  createQuote(
    quote: Omit<QuoteRecord, "id" | "createdAt">,
    now: string
  ): QuoteRecord {
    const record: QuoteRecord = { ...quote, id: nextId("qt"), createdAt: now };
    this.quotes.set(record.id, record);
    return record;
  }
  getQuote(id: string): QuoteRecord | null {
    return this.quotes.get(id) ?? null;
  }
  listQuotes(): QuoteRecord[] {
    return [...this.quotes.values()];
  }

  createOrder(
    order: Omit<PurchaseOrder, "id" | "createdAt">,
    now: string
  ): PurchaseOrder {
    const record: PurchaseOrder = {
      ...order,
      id: nextId("po"),
      createdAt: now,
    };
    this.orders.set(record.id, record);
    return record;
  }
  getOrder(id: string): PurchaseOrder | null {
    return this.orders.get(id) ?? null;
  }
  listOrders(): PurchaseOrder[] {
    return [...this.orders.values()];
  }
  applyOrderStatus(
    orderId: string,
    status: OrderStatus,
    now: string,
    note?: string
  ): PurchaseOrder | null {
    const order = this.orders.get(orderId);
    if (!order) return null;
    const updated: PurchaseOrder = {
      ...order,
      status,
      statusHistory: [...order.statusHistory, { status, at: now, note }],
    };
    this.orders.set(orderId, updated);
    return updated;
  }

  registerOffer(opaqueId: string, sellerId: string, channel: string): void {
    this.offerIndex.set(opaqueId, { sellerId, channel });
  }
  lookupOffer(
    opaqueId: string
  ): { sellerId: string; channel: string } | null {
    return this.offerIndex.get(opaqueId) ?? null;
  }

  importShopHistory(
    entries: Array<Omit<ShopHistoryEntry, "id">>
  ): number {
    for (const e of entries) {
      this.shopHistory.push({ ...e, id: nextId("sh") });
    }
    return entries.length;
  }
  getShopHistoryBaseline(
    oeNumber: string,
    now: string
  ): ShopHistoryBaseline | null {
    const key = normalizeOeKey(oeNumber);
    if (!key) return null;
    const cutoff = new Date(now).getTime() - SIX_MONTHS_MS;
    // Staleness decay: entries older than 6 months never qualify.
    const fresh = this.shopHistory.filter(
      (e) =>
        normalizeOeKey(e.oeNumber) === key &&
        new Date(e.date).getTime() >= cutoff
    );
    if (fresh.length === 0) return null;
    const totalQty = fresh.reduce((s, e) => s + e.qty, 0) || 1;
    const avgPrice =
      fresh.reduce((s, e) => s + e.unitPrice * e.qty, 0) / totalQty;
    const latest = fresh
      .map((e) => e.date)
      .sort()
      .at(-1)!;
    return { avgPrice, entries: fresh.length, latest };
  }
  countShopHistory(): number {
    return this.shopHistory.length;
  }

  logResolution(
    entry: Omit<ResolutionLogEntry, "id" | "createdAt">,
    now: string
  ): ResolutionLogEntry {
    const record: ResolutionLogEntry = {
      ...entry,
      id: nextId("res"),
      createdAt: now,
    };
    this.resolutions.push(record);
    return record;
  }
  listResolutions(): ResolutionLogEntry[] {
    return [...this.resolutions];
  }

  getOeConsensus(key: string): OeConsensusItem[] | null {
    return this.oeConsensus.get(key)?.results ?? null;
  }
  saveOeConsensus(
    key: string,
    results: OeConsensusItem[],
    now: string
  ): void {
    this.oeConsensus.set(key, { key, createdAt: now, results });
  }
  listOeConsensus(): OeConsensusRecord[] {
    return [...this.oeConsensus.values()];
  }

  ensurePhoto(url: string, context: string, now: string): PhotoCurationEntry {
    const id =
      "ph_" +
      createHash("sha256").update(url).digest("base64url").slice(0, 12);
    const existing = this.photos.get(id);
    if (existing) return existing;
    const entry: PhotoCurationEntry = {
      id,
      url,
      context,
      status: "pending",
      createdAt: now,
      reviewedAt: null,
    };
    this.photos.set(id, entry);
    return entry;
  }
  reviewPhoto(
    id: string,
    status: "approved" | "rejected",
    now: string
  ): PhotoCurationEntry | null {
    const entry = this.photos.get(id);
    if (!entry) return null;
    const updated: PhotoCurationEntry = {
      ...entry,
      status,
      reviewedAt: now,
    };
    this.photos.set(id, updated);
    return updated;
  }
  listPhotos(status?: PhotoCurationStatus): PhotoCurationEntry[] {
    const all = [...this.photos.values()];
    return status ? all.filter((p) => p.status === status) : all;
  }

  logChoice(
    record: Omit<ChoiceRecord, "id" | "createdAt">,
    now: string
  ): ChoiceRecord {
    const full: ChoiceRecord = {
      ...record,
      id: nextId("ch"),
      createdAt: now,
    };
    this.choices.push(full);
    return full;
  }
  listChoices(): ChoiceRecord[] {
    return [...this.choices];
  }
}

// Swap this line for a DB-backed implementation later.
export const store: DataStore = new InMemoryStore();
