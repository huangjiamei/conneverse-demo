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
}

// Swap this line for a DB-backed implementation later.
export const store: DataStore = new InMemoryStore();
