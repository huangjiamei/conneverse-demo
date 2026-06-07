"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getMakes, getModels, getYears } from "@/data/vehicles";
import {
  PARTS_CATALOG,
  getPartsForVehicle,
  getCategories,
  getPartsByCategory,
  Part,
} from "@/data/parts-catalog";
import { SHOP_CONFIG } from "@/data/shop-config";
import { useShop } from "@/context/ShopContext";
import type { AggregateResult, Offering } from "@/lib/offerings/index.ts";
import {
  Check,
  Clock,
  RotateCcw,
  Lock,
  Plus,
  Minus,
  Trash2,
  FileText,
  MapPin,
  Car,
  X,
  Search,
  ShoppingCart,
  Loader2,
  Settings,
  ChevronDown,
  ExternalLink,
  Sparkles,
} from "lucide-react";

const SEARCH_STEPS = [
  "Searching local distributors...",
  "Searching live marketplace (eBay)...",
  "Scoring offerings on reliability...",
  "Picking top 2 picks...",
];

// ─── Types ───

type QuoteItem = {
  id: string;
  partName: string;
  partNumber: string;
  brand: string;
  supplierId: string;
  supplierName: string;
  price: number;
  warranty: string;
  deliveryLabel: string;
  qty: number;
  option: "A" | "B";
  category: string;
};

// ─── Helpers ───

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

function channelDisplayLabel(o: Offering): string {
  // What appears as the chip on a card. eBay marketplace listings get
  // their seller feedback %; simulated suppliers get their "type"
  // (Local Distributor, National Chain, etc.).
  if (o.channel === "ebay") {
    const fp = o.reliability.marketplace;
    return `${o.channelLabel} · ${(fp * 100).toFixed(1)}% pos`;
  }
  return o.channelLabel;
}

// ─── Guarantee Badges ───
//
// Badges adapt to the offering's channel: a Conneverse-vetted simulated
// supplier shows the full guarantee bar; an eBay marketplace listing
// shows only what's actually verified for that listing.

function OfferingGuarantees({ offering }: { offering: Offering }) {
  const isVetted = offering.channel === "simulated";
  const badges = isVetted
    ? [
        { icon: <Check size={12} />, label: "Fitment Verified", primary: true },
        { icon: <Lock size={12} />, label: "Price Locked" },
        { icon: <Clock size={12} />, label: "Delivery SLA" },
        { icon: <RotateCcw size={12} />, label: "30-Day Returns" },
      ]
    : [
        { icon: <Check size={12} />, label: "Fitment Verified", primary: true },
        { icon: <RotateCcw size={12} />, label: "Seller returns policy" },
      ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-teal bg-teal/5 ${
            b.primary ? "px-3 py-1.5 text-xs font-semibold ring-1 ring-teal/20" : ""
          }`}
        >
          {b.icon}
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ─── Reliability breakdown ───
//
// Inline expandable detail that demystifies how each composite score
// was computed. This is the visible "moat" — the customer sees that
// Conneverse weighs fulfillment + quality + loyalty signals.

function ReliabilityBreakdownView({
  offering,
}: {
  offering: Offering;
}) {
  const r = offering.reliability;
  const rows: Array<{ label: string; value: number }> = [
    { label: "Fulfillment", value: r.fulfillment },
    { label: "Quality", value: r.quality },
    { label: "Loyalty", value: r.loyalty },
    { label: "Marketplace", value: r.marketplace },
  ];
  return (
    <div className="mt-2 pt-2 border-t border-gray-200/80 space-y-1.5 text-[11px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="text-gray-500 w-[72px] shrink-0">{row.label}</span>
          <div className="flex-1 bg-gray-200 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-teal rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, row.value * 100))}%` }}
            />
          </div>
          <span className="text-gray-600 tabular-nums w-8 text-right">
            {Math.round(row.value * 100)}
          </span>
        </div>
      ))}
      {r.curation !== 0 && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-gray-500 w-[72px] shrink-0">Curation</span>
          <span
            className={`flex-1 text-[11px] ${
              r.curation > 0 ? "text-teal" : "text-amber"
            }`}
          >
            {r.curation > 0 ? "+" : ""}
            {Math.round(r.curation * 100)} pts
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-200/80">
        <span className="text-dark font-medium w-[72px] shrink-0">
          Composite
        </span>
        <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-[#1B2838] rounded-full"
            style={{ width: `${r.composite * 100}%` }}
          />
        </div>
        <span className="text-dark font-semibold tabular-nums w-8 text-right">
          {Math.round(r.composite * 100)}
        </span>
      </div>
      {r.provisional && (
        <p className="text-[11px] text-amber pt-1 flex items-start gap-1">
          <span className="font-bold leading-none mt-0.5">!</span>
          <span>
            Provisional — earns full credit with verified Conneverse
            orders.
          </span>
        </p>
      )}
      {r.sampleSize > 0 && (
        <p className="text-[10px] text-gray-400">
          Based on {r.sampleSize.toLocaleString()} reviews
        </p>
      )}
    </div>
  );
}

// ─── Main Page ───

export default function Home() {
  const router = useRouter();
  const { profile, isLoaded } = useShop();

  useEffect(() => {
    if (isLoaded && !profile) {
      router.replace("/login");
    }
  }, [isLoaded, profile, router]);

  // Vehicle selection
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");

  // Part selection
  const [activeCategory, setActiveCategory] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Quote
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [laborHours, setLaborHours] = useState(0);

  // Mobile quote drawer
  const [showQuoteDrawer, setShowQuoteDrawer] = useState(false);

  // Demo banner
  const [showBanner, setShowBanner] = useState(true);

  // Loading animation
  const [isSearching, setIsSearching] = useState(false);
  const [searchStep, setSearchStep] = useState(0);
  const [searchProgress, setSearchProgress] = useState(0);
  const [resultsVisible, setResultsVisible] = useState(false);

  // Button pulse
  const [pulsingButton, setPulsingButton] = useState<string | null>(null);

  // Aggregator results (Option A + Option B + funnel metadata)
  const [aggregate, setAggregate] = useState<AggregateResult | null>(null);
  const [aggregating, setAggregating] = useState(false);
  const [aggregateError, setAggregateError] = useState<string | null>(null);

  // Expandable reliability breakdown — keyed by offering id
  const [expandedReliability, setExpandedReliability] = useState<
    Record<string, boolean>
  >({});

  const searchRef = useRef<HTMLDivElement>(null);

  // Animated part selection. We set selectedPartId immediately (so the
  // aggregator fetch kicks off in parallel with the animation) and
  // only flip `resultsVisible` once the animation reaches the end.
  // The render gate also waits on `aggregating` so the cards don't
  // appear before the API actually returns.
  const selectPart = useCallback((partId: string, category: string, name: string) => {
    setResultsVisible(false);
    setIsSearching(true);
    setSearchStep(0);
    setSearchProgress(0);
    setSearchQuery(name);
    setActiveCategory(category);
    setSelectedPartId(partId);
    setExpandedReliability({});

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
  }, []);

  // Close autocomplete on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

    const params = new URLSearchParams({
      partId: selectedPartId,
      year: String(year),
      make,
      model,
    });
    if (profile?.zipCode) params.set("zip", profile.zipCode);
    const url = `/api/offerings?${params.toString()}`;

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
        }
        if (!controller.signal.aborted) {
          setAggregate(data as AggregateResult);
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

  const makes = useMemo(() => getMakes(), []);
  const models = useMemo(() => (make ? getModels(make) : []), [make]);
  const years = useMemo(
    () => (make && model ? getYears(make, model) : []),
    [make, model]
  );

  const vehicleSelected = make && model && year;

  const availableParts = useMemo(
    () =>
      vehicleSelected
        ? getPartsForVehicle(make, model, year as number)
        : [],
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

  const optionA: Offering | null = aggregate?.optionA ?? null;
  const optionB: Offering | null = aggregate?.optionB ?? null;
  const hasResults = !!(optionA || optionB);

  // Autocomplete filtered parts
  const autocompleteParts = useMemo(() => {
    if (!searchQuery.trim() || !vehicleSelected) return [];
    const q = searchQuery.toLowerCase();
    return availableParts
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [searchQuery, availableParts, vehicleSelected]);

  // Quote helpers
  function addToQuote(
    offering: Offering,
    part: Part,
    option: "A" | "B"
  ) {
    const existing = quoteItems.find(
      (qi) =>
        qi.partNumber === part.partNumber &&
        qi.supplierId === offering.sellerId
    );
    if (existing) {
      setQuoteItems((items) =>
        items.map((qi) =>
          qi.id === existing.id ? { ...qi, qty: qi.qty + 1 } : qi
        )
      );
      return;
    }
    const warrantyLabel =
      offering.warrantyDays != null
        ? offering.warrantyDays >= 30
          ? `${Math.round(offering.warrantyDays / 30)} mo warranty`
          : `${offering.warrantyDays} day warranty`
        : offering.condition === "new"
        ? "Seller warranty"
        : "As-is";
    setQuoteItems((items) => [
      ...items,
      {
        id: `${part.id}-${offering.sellerId}-${Date.now()}`,
        partName: part.name,
        partNumber: part.partNumber,
        brand: offering.brand ?? "—",
        supplierId: offering.sellerId,
        supplierName: offering.sellerName,
        price: offering.landedPrice,
        warranty: warrantyLabel,
        deliveryLabel: offering.deliveryLabel,
        qty: 1,
        option,
        category: part.category,
      },
    ]);
  }

  function updateQty(id: string, delta: number) {
    setQuoteItems((items) =>
      items
        .map((qi) => (qi.id === id ? { ...qi, qty: Math.max(0, qi.qty + delta) } : qi))
        .filter((qi) => qi.qty > 0)
    );
  }

  function removeItem(id: string) {
    setQuoteItems((items) => items.filter((qi) => qi.id !== id));
  }

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

  function clearVehicle() {
    setMake("");
    setModel("");
    setYear("");
    setActiveCategory("");
    setSelectedPartId("");
    setSearchQuery("");
  }

  // Savings calculation — Option B's price advantage over Option A.
  const savings =
    optionA && optionB
      ? optionA.landedPrice - optionB.landedPrice
      : 0;
  const savingsPct =
    optionA && savings > 0
      ? Math.round((savings / optionA.landedPrice) * 100)
      : 0;

  if (!isLoaded || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ─── DEMO BANNER ─── */}
      {showBanner && (
        <div className="relative z-50 bg-gradient-to-r from-teal to-[#1B2838] text-white text-center text-[13px] py-2 px-4">
          <span>Conneverse Demo — Pricing is simulated. This is what the real product looks like.</span>
          <button
            onClick={() => setShowBanner(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-50 bg-[#1B2838] text-white shadow-lg">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div>
            <span className="text-lg sm:text-xl font-bold tracking-tight">
              Conneverse
            </span>
            <span className="block text-[12px] text-teal -mt-0.5 tracking-wide">
              {profile.shopName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-gray-400 text-sm">
              <MapPin size={14} />
              <span>{profile.region}</span>
            </div>
            <Link
              href="/login"
              aria-label="Edit shop settings"
              className="text-gray-400 hover:text-white transition"
            >
              <Settings size={16} />
            </Link>
          </div>
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="flex-1 flex justify-center">
        <div className="flex w-full max-w-[1200px] px-4 sm:px-6 py-6 gap-6">
          {/* ─── MAIN CONTENT ─── */}
          <main className="flex-1 min-w-0">
            {/* ─── ZONE 2: Vehicle + Part Selector ─── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 max-w-[860px] mx-auto">
              {/* Vehicle selector */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Make
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition"
                    value={make}
                    onChange={(e) => {
                      setMake(e.target.value);
                      setModel("");
                      setYear("");
                      setActiveCategory("");
                      setSelectedPartId("");
                      setSearchQuery("");
                    }}
                  >
                    <option value="">Select Make</option>
                    {makes.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Model
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition disabled:opacity-50"
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      setYear("");
                      setActiveCategory("");
                      setSelectedPartId("");
                      setSearchQuery("");
                    }}
                    disabled={!make}
                  >
                    <option value="">Select Model</option>
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Year
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition disabled:opacity-50"
                    value={year}
                    onChange={(e) => {
                      setYear(e.target.value ? Number(e.target.value) : "");
                      setActiveCategory("");
                      setSelectedPartId("");
                      setSearchQuery("");
                    }}
                    disabled={!model}
                  >
                    <option value="">Select Year</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Vehicle chip */}
              {vehicleSelected && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-2 bg-teal/10 text-teal rounded-full px-3 py-1 text-sm font-medium">
                    <Car size={14} />
                    {year} {make} {model}
                    <button
                      onClick={clearVehicle}
                      className="ml-1 hover:bg-teal/20 rounded-full p-0.5 transition"
                    >
                      <X size={14} />
                    </button>
                  </span>
                </div>
              )}

              {/* Category pills */}
              {vehicleSelected && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setActiveCategory(
                          activeCategory === cat ? "" : cat
                        );
                        setSelectedPartId("");
                        setSearchQuery("");
                      }}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                        activeCategory === cat
                          ? "bg-teal text-white shadow-sm"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cat}
                      <span
                        className={`ml-1.5 text-xs ${
                          activeCategory === cat
                            ? "text-white/80"
                            : "text-gray-400"
                        }`}
                      >
                        {categoryCounts[cat] || 0}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Part search */}
              {vehicleSelected && (
                <div className="mt-4 relative" ref={searchRef}>
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="Search for a specific part..."
                      className="w-full rounded-lg border border-gray-200 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowAutocomplete(true);
                        setSelectedPartId("");
                      }}
                      onFocus={() => setShowAutocomplete(true)}
                    />
                  </div>
                  {showAutocomplete && autocompleteParts.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      {autocompleteParts.map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal/5 transition flex items-center justify-between"
                          onClick={() => {
                            setShowAutocomplete(false);
                            selectPart(p.id, p.category, p.name);
                          }}
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-gray-400">
                            {p.category}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── EMPTY STATE ─── */}
            {!vehicleSelected && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Car size={48} strokeWidth={1.5} />
                <p className="mt-3 text-base">
                  Select a vehicle above to start searching
                </p>
              </div>
            )}

            {/* ─── CATEGORY GRID (vehicle selected, no part selected) ─── */}
            {vehicleSelected && !selectedPart && categoryParts.length > 0 && (
              <div className="max-w-[860px] mx-auto mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categoryParts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectPart(p.id, p.category, p.name)}
                      className="bg-white rounded-lg border border-gray-100 p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-12 h-10 rounded object-cover"
                        />
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {p.partNumber} &middot; {p.category}
                          </p>
                          <p className="text-xs text-teal mt-1">
                            From {formatPrice(Math.min(...p.suppliers.map((s) => s.price)))}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ─── SEARCH / AGGREGATOR LOADING ─── */}
            {(isSearching || aggregating) && selectedPart && (
              <div className="max-w-[860px] mx-auto mt-6">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4 overflow-hidden">
                    <div
                      className="h-full bg-teal rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${
                          !isSearching && aggregating ? 100 : searchProgress
                        }%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 size={16} className="animate-spin text-teal" />
                    <span>
                      {isSearching
                        ? SEARCH_STEPS[
                            Math.min(searchStep, SEARCH_STEPS.length - 1)
                          ]
                        : "Picking top 2 picks..."}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ─── AGGREGATOR ERROR ─── */}
            {!isSearching && !aggregating && selectedPart && aggregateError && (
              <div className="max-w-[860px] mx-auto mt-6">
                <div className="bg-white rounded-xl border border-red-200 p-6 text-center">
                  <p className="text-sm font-medium text-red-700 mb-1">
                    Couldn&rsquo;t load offerings.
                  </p>
                  <p className="text-xs text-gray-500">{aggregateError}</p>
                </div>
              </div>
            )}

            {/* ─── ZONE 3: Aggregated Results ─── */}
            {!isSearching && !aggregating && selectedPart && aggregate && (
              <div
                className={`max-w-[860px] mx-auto mt-6 transition-opacity duration-300 ${
                  resultsVisible ? "opacity-100" : "opacity-0"
                }`}
              >
                {/* Funnel header — the demo's visible value prop */}
                <div className="bg-teal/5 rounded-lg border border-teal/15 px-4 py-3 mb-5">
                  <div className="flex items-start gap-2.5 text-sm">
                    <Sparkles
                      size={16}
                      className="text-teal mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-dark font-medium">
                        Compared {aggregate.meta.totalConsidered} offerings
                        across {aggregate.meta.channelsSearched.length} channel
                        {aggregate.meta.channelsSearched.length === 1
                          ? ""
                          : "s"}{" "}
                        in {(aggregate.meta.durationMs / 1000).toFixed(1)}s.
                      </p>
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        {aggregate.meta.totalAfterFilters} passed quality +
                        reliability gates
                        {aggregate.meta.totalConsidered -
                          aggregate.meta.totalAfterFilters >
                          0 && (
                          <>
                            {" · "}
                            {aggregate.meta.totalConsidered -
                              aggregate.meta.totalAfterFilters}{" "}
                            filtered out
                          </>
                        )}
                        {hasResults ? " · Top 2 picks below." : "."}
                      </p>
                    </div>
                  </div>
                </div>

                {hasResults ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* OPTION A — Ready Now */}
                    {optionA && (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
                        <div className="h-[3px] bg-teal" />
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-teal">
                              Ready Now
                            </span>
                          </div>
                          <p className="text-base font-semibold text-dark">
                            {optionA.deliveryLabel}
                          </p>

                          <hr className="my-3 border-gray-100" />

                          {/* Product image */}
                          <div className="flex flex-col items-center mb-3">
                            <img
                              src={selectedPart.imageUrl}
                              alt={selectedPart.name}
                              className="w-[120px] h-[96px] rounded-lg object-cover"
                            />
                            <a
                              href={selectedPart.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1.5 text-[11px] text-teal hover:underline"
                            >
                              &#9654; Watch product video
                            </a>
                          </div>

                          <hr className="my-3 border-gray-100" />

                          <p className="text-[15px] font-medium">
                            {selectedPart.name}
                          </p>
                          <p className="text-[13px] text-gray-400 mt-0.5">
                            {optionA.brand ?? "—"} &middot;{" "}
                            {optionA.condition === "new"
                              ? "New"
                              : optionA.condition[0].toUpperCase() +
                                optionA.condition.slice(1)}
                          </p>

                          {/* Source + reliability — the moat */}
                          <div className="mt-3 p-2.5 bg-gray-50/70 rounded-lg border border-gray-100">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-[12px] text-gray-600 min-w-0">
                                <span className="shrink-0">Sourced from</span>
                                <span className="font-medium text-dark truncate">
                                  {optionA.sellerName}
                                </span>
                              </div>
                              <button
                                onClick={() =>
                                  setExpandedReliability((s) => ({
                                    ...s,
                                    [optionA.id]: !s[optionA.id],
                                  }))
                                }
                                className="inline-flex items-center gap-0.5 text-[12px] font-medium text-gray-600 hover:text-dark shrink-0"
                              >
                                <span>
                                  {Math.round(
                                    optionA.reliability.composite * 100
                                  )}
                                  %
                                </span>
                                <ChevronDown
                                  size={11}
                                  className={`transition-transform ${
                                    expandedReliability[optionA.id]
                                      ? "rotate-180"
                                      : ""
                                  }`}
                                />
                              </button>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {channelDisplayLabel(optionA)}
                            </p>
                            {expandedReliability[optionA.id] && (
                              <ReliabilityBreakdownView offering={optionA} />
                            )}
                          </div>

                          <hr className="my-3 border-gray-100" />

                          <p className="text-[28px] font-bold text-[#1B2838]">
                            {formatPrice(optionA.landedPrice)}
                          </p>
                          {optionA.shippingCost > 0 && (
                            <p className="text-[11px] text-gray-400">
                              Includes {formatPrice(optionA.shippingCost)}{" "}
                              shipping
                            </p>
                          )}

                          <div className="mt-3">
                            <OfferingGuarantees offering={optionA} />
                          </div>

                          <button
                            onClick={() => {
                              addToQuote(optionA, selectedPart, "A");
                              setPulsingButton("A");
                              setTimeout(() => setPulsingButton(null), 600);
                            }}
                            className={`mt-4 w-full h-11 rounded-lg bg-teal text-white font-medium text-sm hover:bg-teal/90 active:scale-[0.98] transition-all duration-150 ${
                              pulsingButton === "A" ? "animate-pulse" : ""
                            }`}
                          >
                            Add to Quote &rarr;
                          </button>

                          {optionA.sourceUrl && (
                            <a
                              href={optionA.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
                            >
                              View original listing{" "}
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* OPTION B — Best Price */}
                    {optionB && (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
                        <div className="h-[3px] bg-amber" />
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-amber">
                              Best Price
                            </span>
                            {savings > 0 && (
                              <span className="text-[11px] font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">
                                Save {formatPrice(savings)} ({savingsPct}%)
                              </span>
                            )}
                          </div>
                          <p className="text-base font-semibold text-dark">
                            {optionB.deliveryLabel}
                          </p>

                          <hr className="my-3 border-gray-100" />

                          <div className="flex flex-col items-center mb-3">
                            <img
                              src={selectedPart.imageUrl}
                              alt={selectedPart.name}
                              className="w-[120px] h-[96px] rounded-lg object-cover"
                            />
                            <a
                              href={selectedPart.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1.5 text-[11px] text-amber hover:underline"
                            >
                              &#9654; Watch product video
                            </a>
                          </div>

                          <hr className="my-3 border-gray-100" />

                          <p className="text-[15px] font-medium">
                            {selectedPart.name}
                          </p>
                          <p className="text-[13px] text-gray-400 mt-0.5">
                            {optionB.brand ?? "—"} &middot;{" "}
                            {optionB.condition === "new"
                              ? "New"
                              : optionB.condition[0].toUpperCase() +
                                optionB.condition.slice(1)}
                          </p>

                          <div className="mt-3 p-2.5 bg-gray-50/70 rounded-lg border border-gray-100">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-[12px] text-gray-600 min-w-0">
                                <span className="shrink-0">Sourced from</span>
                                <span className="font-medium text-dark truncate">
                                  {optionB.sellerName}
                                </span>
                              </div>
                              <button
                                onClick={() =>
                                  setExpandedReliability((s) => ({
                                    ...s,
                                    [optionB.id]: !s[optionB.id],
                                  }))
                                }
                                className="inline-flex items-center gap-0.5 text-[12px] font-medium text-gray-600 hover:text-dark shrink-0"
                              >
                                <span>
                                  {Math.round(
                                    optionB.reliability.composite * 100
                                  )}
                                  %
                                </span>
                                <ChevronDown
                                  size={11}
                                  className={`transition-transform ${
                                    expandedReliability[optionB.id]
                                      ? "rotate-180"
                                      : ""
                                  }`}
                                />
                              </button>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {channelDisplayLabel(optionB)}
                            </p>
                            {expandedReliability[optionB.id] && (
                              <ReliabilityBreakdownView offering={optionB} />
                            )}
                          </div>

                          <hr className="my-3 border-gray-100" />

                          <p className="text-[28px] font-bold text-[#1B2838]">
                            {formatPrice(optionB.landedPrice)}
                          </p>
                          {optionB.shippingCost > 0 && (
                            <p className="text-[11px] text-gray-400">
                              Includes {formatPrice(optionB.shippingCost)}{" "}
                              shipping
                            </p>
                          )}

                          <div className="mt-3">
                            <OfferingGuarantees offering={optionB} />
                          </div>

                          <button
                            onClick={() => {
                              addToQuote(optionB, selectedPart, "B");
                              setPulsingButton("B");
                              setTimeout(() => setPulsingButton(null), 600);
                            }}
                            className={`mt-4 w-full h-11 rounded-lg bg-amber text-white font-medium text-sm hover:bg-amber/90 active:scale-[0.98] transition-all duration-150 ${
                              pulsingButton === "B" ? "animate-pulse" : ""
                            }`}
                          >
                            Add to Quote &rarr;
                          </button>

                          {optionB.sourceUrl && (
                            <a
                              href={optionB.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
                            >
                              View original listing{" "}
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                    <p className="text-base font-medium text-gray-700 mb-2">
                      No quality-verified options for this part right now.
                    </p>
                    <p className="text-sm text-gray-400 mb-3 max-w-md mx-auto">
                      We searched {aggregate.meta.totalConsidered} listings
                      across {aggregate.meta.channelsSearched.length} channel
                      {aggregate.meta.channelsSearched.length === 1 ? "" : "s"}.{" "}
                      {aggregate.meta.totalAfterFilters} passed quality +
                      reliability gates &mdash; but none met our standards for{" "}
                      {year} {make} {model}.
                    </p>
                    <p className="text-xs text-gray-400">
                      Try another part, or check back later as suppliers refresh
                      inventory.
                    </p>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* ─── ZONE 4: Quote Builder (Desktop Sidebar) ─── */}
          <aside className="hidden md:block w-[300px] shrink-0">
            <div className="sticky top-20 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-base font-bold flex items-center gap-2">
                <FileText size={16} />
                Quote Builder
              </h2>

              {quoteItems.length === 0 ? (
                <p className="text-sm text-gray-400 mt-4 text-center py-6">
                  Add parts from the results to build a quote.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {quoteItems.map((qi) => (
                    <div
                      key={qi.id}
                      className="border border-gray-100 rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              qi.option === "A"
                                ? "bg-teal/10 text-teal"
                                : "bg-amber/10 text-amber"
                            }`}
                          >
                            Option {qi.option}
                          </span>
                          <p className="text-sm font-medium mt-1">
                            {qi.partName}
                          </p>
                          <p className="text-xs text-gray-400">{qi.brand}</p>
                        </div>
                        <button
                          onClick={() => removeItem(qi.id)}
                          className="text-gray-300 hover:text-red-500 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateQty(qi.id, -1)}
                            className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-sm font-medium w-6 text-center">
                            {qi.qty}
                          </span>
                          <button
                            onClick={() => updateQty(qi.id, 1)}
                            className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <span className="text-sm font-semibold">
                          {formatPrice(qi.price * qi.qty)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Labor */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Labor hours:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        setLaborHours(Math.max(0, laborHours - 0.5))
                      }
                      className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-sm font-medium w-8 text-center">
                      {laborHours}
                    </span>
                    <button
                      onClick={() => setLaborHours(laborHours + 0.5)}
                      className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-right mt-0.5">
                  &times; ${laborRate}/hr = {formatPrice(laborTotal)}
                </p>
              </div>

              {/* Totals */}
              <div className="mt-4 pt-3 border-t border-gray-100 space-y-1 text-sm">
                {optionASubtotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Option A subtotal:</span>
                    <span>{formatPrice(optionASubtotal)}</span>
                  </div>
                )}
                {optionBSubtotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Option B subtotal:</span>
                    <span>{formatPrice(optionBSubtotal)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Labor:</span>
                  <span>{formatPrice(laborTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    Tax ({(SHOP_CONFIG.taxRate * 100).toFixed(2)}%):
                  </span>
                  <span>{formatPrice(tax)}</span>
                </div>
                <hr className="border-gray-200" />
                <div className="flex justify-between text-base font-bold">
                  <span>Grand Total:</span>
                  <span>{formatPrice(grandTotal)}</span>
                </div>
              </div>

              {/* Generate PDF */}
              <button
                onClick={async () => {
                  const { generateQuotePDF } = await import(
                    "@/lib/generate-quote-pdf"
                  );
                  generateQuotePDF({
                    optionA:
                      optionAItems.length > 0
                        ? {
                            label: "Option A — Ready in 2 Hours",
                            deliveryLabel:
                              optionAItems[0]?.deliveryLabel ?? "",
                            items: optionAItems.map((qi) => ({
                              partName: qi.partName,
                              partNumber: qi.partNumber,
                              brand: qi.brand,
                              qty: qi.qty,
                              unitPrice: qi.price,
                              warranty: qi.warranty,
                            })),
                            partsSubtotal: optionASubtotal,
                          }
                        : undefined,
                    optionB:
                      optionBItems.length > 0
                        ? {
                            label: "Option B — Ready Tomorrow",
                            deliveryLabel:
                              optionBItems[0]?.deliveryLabel ?? "",
                            items: optionBItems.map((qi) => ({
                              partName: qi.partName,
                              partNumber: qi.partNumber,
                              brand: qi.brand,
                              qty: qi.qty,
                              unitPrice: qi.price,
                              warranty: qi.warranty,
                            })),
                            partsSubtotal: optionBSubtotal,
                            savings:
                              optionASubtotal > 0
                                ? optionASubtotal - optionBSubtotal
                                : undefined,
                          }
                        : undefined,
                    laborHours,
                    vehicle: vehicleSelected
                      ? {
                          year: year as number,
                          make,
                          model,
                        }
                      : { year: 0, make: "", model: "" },
                    shopConfig: {
                      name: profile.shopName,
                      address: profile.address,
                      phone: profile.phone,
                      laborRate: profile.laborRate,
                      taxRate: SHOP_CONFIG.taxRate,
                    },
                  });
                }}
                className="mt-4 w-full h-11 rounded-lg bg-[#1B2838] text-white font-medium text-sm hover:bg-[#1B2838]/90 transition"
              >
                Generate PDF Quote
              </button>

              {quoteItems.length > 0 && (
                <button
                  onClick={() => {
                    setQuoteItems([]);
                    setLaborHours(0);
                  }}
                  className="mt-2 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  Clear All
                </button>
              )}

              <p className="mt-3 text-[12px] text-gray-400 text-center">
                PDF shows both options so your customer can choose.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* ─── Mobile Quote Bottom Bar ─── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-gray-500" />
            <span className="text-sm font-medium">
              {quoteItems.length} items &middot; {formatPrice(grandTotal)}
            </span>
          </div>
          <button
            onClick={() => setShowQuoteDrawer(true)}
            className="bg-[#1B2838] text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            View Quote
          </button>
        </div>
      </div>

      {/* ─── Mobile Quote Drawer ─── */}
      {showQuoteDrawer && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50">
          <div className="absolute inset-x-0 bottom-0 top-12 bg-white rounded-t-2xl overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <FileText size={16} />
                Quote Builder
              </h2>
              <button
                onClick={() => setShowQuoteDrawer(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {quoteItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">
                Add parts from the results to build a quote.
              </p>
            ) : (
              <div className="space-y-3">
                {quoteItems.map((qi) => (
                  <div
                    key={qi.id}
                    className="border border-gray-100 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            qi.option === "A"
                              ? "bg-teal/10 text-teal"
                              : "bg-amber/10 text-amber"
                          }`}
                        >
                          Option {qi.option}
                        </span>
                        <p className="text-sm font-medium mt-1">
                          {qi.partName}
                        </p>
                        <p className="text-xs text-gray-400">{qi.brand}</p>
                      </div>
                      <button
                        onClick={() => removeItem(qi.id)}
                        className="text-gray-300 hover:text-red-500 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQty(qi.id, -1)}
                          className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-sm font-medium w-6 text-center">
                          {qi.qty}
                        </span>
                        <button
                          onClick={() => updateQty(qi.id, 1)}
                          className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatPrice(qi.price * qi.qty)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Labor */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Labor hours:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      setLaborHours(Math.max(0, laborHours - 0.5))
                    }
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="text-sm font-medium w-8 text-center">
                    {laborHours}
                  </span>
                  <button
                    onClick={() => setLaborHours(laborHours + 0.5)}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-1 text-sm">
              {optionASubtotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Option A subtotal:</span>
                  <span>{formatPrice(optionASubtotal)}</span>
                </div>
              )}
              {optionBSubtotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Option B subtotal:</span>
                  <span>{formatPrice(optionBSubtotal)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Labor:</span>
                <span>{formatPrice(laborTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Tax ({(SHOP_CONFIG.taxRate * 100).toFixed(2)}%):
                </span>
                <span>{formatPrice(tax)}</span>
              </div>
              <hr className="border-gray-200" />
              <div className="flex justify-between text-base font-bold">
                <span>Grand Total:</span>
                <span>{formatPrice(grandTotal)}</span>
              </div>
            </div>

            {/* Generate PDF */}
            <button
              onClick={async () => {
                const { generateQuotePDF } = await import(
                  "@/lib/generate-quote-pdf"
                );
                generateQuotePDF({
                  optionA:
                    optionAItems.length > 0
                      ? {
                          label: "Option A — Ready in 2 Hours",
                          deliveryLabel:
                            optionAItems[0]?.deliveryLabel ?? "",
                          items: optionAItems.map((qi) => ({
                            partName: qi.partName,
                            partNumber: qi.partNumber,
                            brand: qi.brand,
                            qty: qi.qty,
                            unitPrice: qi.price,
                            warranty: qi.warranty,
                          })),
                          partsSubtotal: optionASubtotal,
                        }
                      : undefined,
                  optionB:
                    optionBItems.length > 0
                      ? {
                          label: "Option B — Ready Tomorrow",
                          deliveryLabel:
                            optionBItems[0]?.deliveryLabel ?? "",
                          items: optionBItems.map((qi) => ({
                            partName: qi.partName,
                            partNumber: qi.partNumber,
                            brand: qi.brand,
                            qty: qi.qty,
                            unitPrice: qi.price,
                            warranty: qi.warranty,
                          })),
                          partsSubtotal: optionBSubtotal,
                          savings:
                            optionASubtotal > 0
                              ? optionASubtotal - optionBSubtotal
                              : undefined,
                        }
                      : undefined,
                  laborHours,
                  vehicle: vehicleSelected
                    ? { year: year as number, make, model }
                    : { year: 0, make: "", model: "" },
                  shopConfig: {
                    name: profile.shopName,
                    address: profile.address,
                    phone: profile.phone,
                    laborRate: profile.laborRate,
                    taxRate: SHOP_CONFIG.taxRate,
                  },
                });
              }}
              className="mt-4 w-full h-11 rounded-lg bg-[#1B2838] text-white font-medium text-sm hover:bg-[#1B2838]/90 transition"
            >
              Generate PDF Quote
            </button>

            {quoteItems.length > 0 && (
              <button
                onClick={() => {
                  setQuoteItems([]);
                  setLaborHours(0);
                }}
                className="mt-2 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
