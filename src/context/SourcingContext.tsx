"use client";

/**
 * SourcingContext — all sourcing + quote state for the SourcingPanel
 * and QuoteCart, lifted out of the page so the panel can be embedded
 * anywhere.
 *
 * The `ContextProvider` interface is the seam for host integration:
 * the standalone app uses `UserInputProvider` (user types everything);
 * a future `HostSmsProvider` will pre-fill vehicle + part lines from a
 * host shop-management system and receive the completed quote back —
 * implementing the same interface, with zero changes to the panel.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getMakes, getModels, getYears } from "@/data/vehicles";
import {
  PARTS_CATALOG,
  getPartsForVehicle,
  getCategories,
  getPartsByCategory,
  type Part,
} from "@/data/parts-catalog";
import { SHOP_CONFIG } from "@/data/shop-config";
import { useShop } from "@/context/ShopContext";
import type {
  PublicOffer,
  PublicSearchResult,
} from "@/types/canonical";
import type { CatalogMatch, VinDecode } from "@/lib/connectors/vpic";
import { isValidVinFormat } from "@/lib/connectors/vpic";
import type { PartRequest, QuoteLine, Vehicle } from "@/types";

export type VehicleEntryMode = "ymm" | "vin";

export const SEARCH_STEPS = [
  "Searching local distributors...",
  "Searching live marketplace (eBay)...",
  "Scoring offerings on reliability...",
  "Picking top 2 picks...",
];

// ─── Host integration seam ──────────────────────────────────────────

export interface ContextProvider {
  /** Vehicle pre-filled by the host, or null when the user enters it. */
  getVehicle(): Vehicle | null;
  /** Part lines pre-filled by the host (e.g. from a repair order). */
  getPartLines(): PartRequest[];
  /** Called when a quote is finalized so the host can ingest it. */
  onQuoteComplete(lines: QuoteLine[]): void;
}

/** Standalone-app behavior: the user enters everything by hand and
 * the quote stays in-app (PDF). */
export class UserInputProvider implements ContextProvider {
  getVehicle(): Vehicle | null {
    return null;
  }
  getPartLines(): PartRequest[] {
    return [];
  }
  onQuoteComplete(): void {
    // No host to notify — the standalone app exports a PDF instead.
  }
}

// ─── Context value ──────────────────────────────────────────────────

type SourcingContextValue = {
  // Vehicle
  make: string;
  model: string;
  year: number | "";
  makes: string[];
  models: string[];
  years: number[];
  vehicleSelected: boolean;
  setMake: (make: string) => void;
  setModel: (model: string) => void;
  setYear: (year: number | "") => void;
  setVehicle: (make: string, model: string, year: number) => void;
  clearVehicle: () => void;

  // VIN entry
  entryMode: VehicleEntryMode;
  setEntryMode: (mode: VehicleEntryMode) => void;
  vinInput: string;
  setVinInput: (vin: string) => void;
  vinDecoding: boolean;
  vinError: string | null;
  /** Decoded vehicle awaiting user confirmation, or null. */
  vinPending: VinDecode | null;
  /** Catalog reconciliation for the pending decode (null = not covered). */
  vinCatalogMatch: CatalogMatch;
  decodeVinInput: () => void;
  confirmVin: () => void;
  rejectVin: () => void;

  // Part selection
  activeCategory: string;
  selectCategory: (category: string) => void;
  selectedPartId: string;
  selectedPart: Part | null;
  searchQuery: string;
  updateSearchQuery: (query: string) => void;
  availableParts: Part[];
  categories: string[];
  categoryParts: Part[];
  categoryCounts: Record<string, number>;
  autocompleteParts: Part[];
  selectPart: (partId: string, category: string, name: string) => void;

  // Search animation
  isSearching: boolean;
  searchStep: number;
  searchProgress: number;
  resultsVisible: boolean;

  // Aggregator (client-facing public projection)
  aggregate: PublicSearchResult | null;
  aggregating: boolean;
  aggregateError: string | null;
  optionA: PublicOffer | null;
  optionB: PublicOffer | null;
  hasResults: boolean;
  savings: number;
  savingsPct: number;

  // Quote
  quoteItems: QuoteLine[];
  addToQuote: (offering: PublicOffer, part: Part, option: "A" | "B") => void;
  updateQty: (id: string, delta: number) => void;
  removeItem: (id: string) => void;
  clearQuote: () => void;
  laborHours: number;
  setLaborHours: (hours: number) => void;
  optionAItems: QuoteLine[];
  optionBItems: QuoteLine[];
  optionASubtotal: number;
  optionBSubtotal: number;
  laborRate: number;
  laborTotal: number;
  tax: number;
  grandTotal: number;

  // Host seam
  contextProvider: ContextProvider;
};

const SourcingContext = createContext<SourcingContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────

export function SourcingProvider({
  children,
  contextProvider,
}: {
  children: ReactNode;
  contextProvider?: ContextProvider;
}) {
  const providerRef = useRef<ContextProvider>(
    contextProvider ?? new UserInputProvider()
  );
  const { profile } = useShop();

  // Vehicle selection
  const [make, setMakeState] = useState("");
  const [model, setModelState] = useState("");
  const [year, setYearState] = useState<number | "">("");

  // VIN entry
  const [entryMode, setEntryMode] = useState<VehicleEntryMode>("ymm");
  const [vinInput, setVinInput] = useState("");
  const [vinDecoding, setVinDecoding] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);
  const [vinPending, setVinPending] = useState<VinDecode | null>(null);
  const [vinCatalogMatch, setVinCatalogMatch] = useState<CatalogMatch>(null);

  // Part selection
  const [activeCategory, setActiveCategory] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Quote
  const [quoteItems, setQuoteItems] = useState<QuoteLine[]>([]);
  const [laborHours, setLaborHours] = useState(0);

  // Loading animation
  const [isSearching, setIsSearching] = useState(false);
  const [searchStep, setSearchStep] = useState(0);
  const [searchProgress, setSearchProgress] = useState(0);
  const [resultsVisible, setResultsVisible] = useState(false);

  // Aggregator results (Option A + Option B + funnel metadata)
  const [aggregate, setAggregate] = useState<PublicSearchResult | null>(null);
  const [aggregating, setAggregating] = useState(false);
  const [aggregateError, setAggregateError] = useState<string | null>(null);

  // Seed from the host context (no-op for UserInputProvider).
  useEffect(() => {
    const hostVehicle = providerRef.current.getVehicle();
    if (hostVehicle) {
      setMakeState(hostVehicle.make);
      setModelState(hostVehicle.model);
      setYearState(hostVehicle.year);
    }
  }, []);

  // Vehicle setters with cascade resets (changing make resets model,
  // year, and any part selection — identical to the original inline
  // handlers).
  const setMake = useCallback((next: string) => {
    setMakeState(next);
    setModelState("");
    setYearState("");
    setActiveCategory("");
    setSelectedPartId("");
    setSearchQuery("");
  }, []);

  const setModel = useCallback((next: string) => {
    setModelState(next);
    setYearState("");
    setActiveCategory("");
    setSelectedPartId("");
    setSearchQuery("");
  }, []);

  const setYear = useCallback((next: number | "") => {
    setYearState(next);
    setActiveCategory("");
    setSelectedPartId("");
    setSearchQuery("");
  }, []);

  /** Set all three vehicle fields atomically (no cascade reset) — used
   * by VIN confirmation, which resolves make+model+year together. */
  const setVehicle = useCallback(
    (nextMake: string, nextModel: string, nextYear: number) => {
      setMakeState(nextMake);
      setModelState(nextModel);
      setYearState(nextYear);
      setActiveCategory("");
      setSelectedPartId("");
      setSearchQuery("");
    },
    []
  );

  const clearVehicle = useCallback(() => {
    setMakeState("");
    setModelState("");
    setYearState("");
    setActiveCategory("");
    setSelectedPartId("");
    setSearchQuery("");
  }, []);

  // ─── VIN decode flow ───

  const decodeVinInput = useCallback(() => {
    const vin = vinInput.trim().toUpperCase();
    setVinError(null);
    setVinPending(null);
    setVinCatalogMatch(null);

    if (!isValidVinFormat(vin)) {
      setVinError("Enter a 17-character VIN (letters and digits, no I/O/Q).");
      return;
    }

    setVinDecoding(true);
    fetch("/api/vin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
        }
        setVinPending(data.decode as VinDecode);
        setVinCatalogMatch((data.catalog as CatalogMatch) ?? null);
        setVinDecoding(false);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Couldn't decode VIN";
        setVinError(`${message} — try the Year/Make/Model dropdowns instead.`);
        setVinDecoding(false);
      });
  }, [vinInput]);

  const confirmVin = useCallback(() => {
    if (vinCatalogMatch) {
      setVehicle(
        vinCatalogMatch.make,
        vinCatalogMatch.model,
        vinCatalogMatch.year
      );
    }
    setVinPending(null);
    setVinCatalogMatch(null);
    setVinInput("");
  }, [vinCatalogMatch, setVehicle]);

  const rejectVin = useCallback(() => {
    setVinPending(null);
    setVinCatalogMatch(null);
    setVinError(null);
  }, []);

  // Category pill toggle: clicking the active pill clears it.
  const selectCategory = useCallback((category: string) => {
    setActiveCategory((current) => (current === category ? "" : category));
    setSelectedPartId("");
    setSearchQuery("");
  }, []);

  // Typing in the part search clears any selected part.
  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedPartId("");
  }, []);

  // Animated part selection. selectedPartId is set immediately (so the
  // aggregator fetch kicks off in parallel with the animation) and
  // `resultsVisible` flips once the animation reaches the end. The
  // render gate also waits on `aggregating` so the cards don't appear
  // before the API actually returns.
  const selectPart = useCallback(
    (partId: string, category: string, name: string) => {
      setResultsVisible(false);
      setIsSearching(true);
      setSearchStep(0);
      setSearchProgress(0);
      setSearchQuery(name);
      setActiveCategory(category);
      setSelectedPartId(partId);

      let step = 0;
      const interval = setInterval(() => {
        step++;
        setSearchStep(step);
        setSearchProgress((step / SEARCH_STEPS.length) * 100);
        if (step >= SEARCH_STEPS.length) {
          clearInterval(interval);
          setTimeout(() => {
            setIsSearching(false);
            setResultsVisible(true);
          }, 200);
        }
      }, 300);
    },
    []
  );

  // Fetch aggregated offerings whenever the selected part / vehicle
  // changes. The aggregator queries every channel in parallel and
  // returns Option A + Option B + funnel metadata. AbortController
  // cancels stale requests when the user picks a different part.
  useEffect(() => {
    if (!selectedPartId || !make || !model || !year) {
      setAggregate(null);
      setAggregateError(null);
      setAggregating(false);
      return;
    }

    const controller = new AbortController();
    setAggregating(true);
    setAggregateError(null);

    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle: { year, make, model },
        partRequest: { partId: selectedPartId },
        zip: profile?.zipCode,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
        }
        if (!controller.signal.aborted) {
          setAggregate(data as PublicSearchResult);
          setAggregating(false);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Aggregator failed";
        console.error("[aggregator fetch] failed:", message);
        setAggregateError(message);
        setAggregate(null);
        setAggregating(false);
      });

    return () => controller.abort();
  }, [selectedPartId, make, model, year, profile?.zipCode]);

  // ─── Derived: vehicle + catalog ───

  const makes = useMemo(() => getMakes(), []);
  const models = useMemo(() => (make ? getModels(make) : []), [make]);
  const years = useMemo(
    () => (make && model ? getYears(make, model) : []),
    [make, model]
  );

  const vehicleSelected = Boolean(make && model && year);

  const availableParts = useMemo(
    () =>
      vehicleSelected ? getPartsForVehicle(make, model, year as number) : [],
    [make, model, year, vehicleSelected]
  );

  const categories = useMemo(
    () => getCategories(availableParts),
    [availableParts]
  );

  const categoryParts = useMemo(
    () =>
      activeCategory
        ? getPartsByCategory(availableParts, activeCategory)
        : availableParts,
    [availableParts, activeCategory]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of availableParts) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    return counts;
  }, [availableParts]);

  const selectedPart = useMemo(
    () => PARTS_CATALOG.find((p) => p.id === selectedPartId) ?? null,
    [selectedPartId]
  );

  const autocompleteParts = useMemo(() => {
    if (!searchQuery.trim() || !vehicleSelected) return [];
    const q = searchQuery.toLowerCase();
    return availableParts
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [searchQuery, availableParts, vehicleSelected]);

  // ─── Derived: results ───

  const optionA: PublicOffer | null = aggregate?.optionA ?? null;
  const optionB: PublicOffer | null = aggregate?.optionB ?? null;
  const hasResults = !!(optionA || optionB);

  // Savings calculation — Option B's price advantage over Option A.
  const savings =
    optionA && optionB ? optionA.price - optionB.price : 0;
  const savingsPct =
    optionA && savings > 0
      ? Math.round((savings / optionA.price) * 100)
      : 0;

  // ─── Quote actions ───

  const addToQuote = useCallback(
    (offering: PublicOffer, part: Part, option: "A" | "B") => {
      setQuoteItems((items) => {
        // Dedup on the opaque offer id — the client never sees seller
        // identity, so `supplierId` here is the anonymized token.
        const existing = items.find(
          (qi) =>
            qi.partNumber === part.partNumber &&
            qi.supplierId === offering.id
        );
        if (existing) {
          return items.map((qi) =>
            qi.id === existing.id ? { ...qi, qty: qi.qty + 1 } : qi
          );
        }
        return [
          ...items,
          {
            id: `${part.id}-${offering.id}-${Date.now()}`,
            partName: part.name,
            partNumber: part.partNumber,
            brand: offering.brand ?? "—",
            supplierId: offering.id,
            // Attribution is always Conneverse — seller identity is
            // never exposed to the client (directive 6).
            supplierName: "Fulfilled by Conneverse",
            price: offering.price,
            warranty: offering.warranty,
            deliveryLabel: offering.deliveryEstimate.label,
            qty: 1,
            option,
            category: part.category,
          },
        ];
      });
    },
    []
  );

  const updateQty = useCallback((id: string, delta: number) => {
    setQuoteItems((items) =>
      items
        .map((qi) =>
          qi.id === id ? { ...qi, qty: Math.max(0, qi.qty + delta) } : qi
        )
        .filter((qi) => qi.qty > 0)
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setQuoteItems((items) => items.filter((qi) => qi.id !== id));
  }, []);

  const clearQuote = useCallback(() => {
    setQuoteItems([]);
    setLaborHours(0);
  }, []);

  // ─── Derived: totals ───

  const optionAItems = quoteItems.filter((qi) => qi.option === "A");
  const optionBItems = quoteItems.filter((qi) => qi.option === "B");
  const optionASubtotal = optionAItems.reduce(
    (sum, qi) => sum + qi.price * qi.qty,
    0
  );
  const optionBSubtotal = optionBItems.reduce(
    (sum, qi) => sum + qi.price * qi.qty,
    0
  );
  const laborRate = profile?.laborRate ?? SHOP_CONFIG.laborRate;
  const laborTotal = laborHours * laborRate;
  const primarySubtotal = optionASubtotal || optionBSubtotal;
  const tax = (primarySubtotal + laborTotal) * SHOP_CONFIG.taxRate;
  const grandTotal = primarySubtotal + laborTotal + tax;

  const value: SourcingContextValue = {
    make,
    model,
    year,
    makes,
    models,
    years,
    vehicleSelected,
    setMake,
    setModel,
    setYear,
    setVehicle,
    clearVehicle,

    entryMode,
    setEntryMode,
    vinInput,
    setVinInput,
    vinDecoding,
    vinError,
    vinPending,
    vinCatalogMatch,
    decodeVinInput,
    confirmVin,
    rejectVin,

    activeCategory,
    selectCategory,
    selectedPartId,
    selectedPart,
    searchQuery,
    updateSearchQuery,
    availableParts,
    categories,
    categoryParts,
    categoryCounts,
    autocompleteParts,
    selectPart,

    isSearching,
    searchStep,
    searchProgress,
    resultsVisible,

    aggregate,
    aggregating,
    aggregateError,
    optionA,
    optionB,
    hasResults,
    savings,
    savingsPct,

    quoteItems,
    addToQuote,
    updateQty,
    removeItem,
    clearQuote,
    laborHours,
    setLaborHours,
    optionAItems,
    optionBItems,
    optionASubtotal,
    optionBSubtotal,
    laborRate,
    laborTotal,
    tax,
    grandTotal,

    contextProvider: providerRef.current,
  };

  return (
    <SourcingContext.Provider value={value}>
      {children}
    </SourcingContext.Provider>
  );
}

export function useSourcing(): SourcingContextValue {
  const ctx = useContext(SourcingContext);
  if (!ctx) {
    throw new Error("useSourcing must be used within a SourcingProvider");
  }
  return ctx;
}
