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
import type { PurchaseOrder, QuoteRecord, Vehicle } from "@/types/canonical";

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
