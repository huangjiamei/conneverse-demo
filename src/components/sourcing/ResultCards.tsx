"use client";

/**
 * Results zone — two views over the same qualified set:
 *
 *   Copilot (pilot default): the comparison grid (≤7 candidates, picks
 *   pinned) is the default view. The machine's A/B picks render as soft
 *   "Our pick" tags on their rows — never as the sole decision. Each
 *   row expands to a detail sheet (curated media, grade tier, warranty,
 *   return terms, fitment evidence). Every selection logs a choice
 *   record (reason chips + implicit signals) — the override-record
 *   store that trains shop preferences and, per the graduation
 *   dashboard, eventually earns autopilot.
 *
 *   Autopilot (earned per shop × category): the two-pick view is the
 *   default; the grid stays one click away (decision #8).
 *
 * Anonymization holds everywhere: "Fulfilled by Conneverse", grade-tier
 * badges (no numeric scores), curated photos only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Bug,
  Check,
  ChevronDown,
  LayoutGrid,
  Rows3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useShop } from "@/context/ShopContext";
import { useSourcing, type SearchUrgency } from "@/context/SourcingContext";
import { formatPrice } from "@/lib/format";
import { TIER_RANK } from "@/lib/grade-tier";
import type { PublicOffer } from "@/types/canonical";
import type { Part } from "@/types";
import { GuaranteeBadges } from "./GuaranteeBadges";
import { GradeTierBadge } from "./GradeTierBadge";

function conditionLabel(condition: PublicOffer["condition"]): string {
  return condition === "new"
    ? "New"
    : condition[0].toUpperCase() + condition.slice(1);
}

/** Map a selection to a quote column: picks keep their role; a grid
 * candidate lands in the lane its delivery speed implies. */
function quoteOption(offer: PublicOffer): "A" | "B" {
  if (offer.role === "A" || offer.role === "B") return offer.role;
  return offer.deliveryEstimate.days <= 1 ? "A" : "B";
}

function youtubeEmbedUrl(watchUrl: string): string | null {
  const m = watchUrl.match(/[?&]v=([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

// ─── Choice capture ─────────────────────────────────────────────────

const CHOICE_REASONS = [
  "better brand",
  "had it before",
  "faster",
  "cheaper, same thing",
  "photos looked right",
];

const WHY_NOT_REASONS = [
  "didn't trust brand",
  "too slow",
  "too expensive",
  "photo unclear",
];

type PendingChoice = {
  picked: PublicOffer;
  /** Expanded-but-unselected candidates eligible for why-not chips. */
  passedOn: PublicOffer[];
};

function ChoiceCapture({
  pending,
  onDone,
}: {
  pending: PendingChoice;
  onDone: (data: {
    choiceReason: string | null;
    freeText: string | null;
    whyNot: Array<{ offerId: string; reason: string }>;
  }) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [whyNot, setWhyNot] = useState<Record<string, string>>({});

  const submit = () =>
    onDone({
      choiceReason: reason,
      freeText: freeText.trim() || null,
      whyNot: Object.entries(whyNot).map(([offerId, r]) => ({
        offerId,
        reason: r,
      })),
    });

  return (
    <div className="mt-4 rounded-xl border border-teal/20 bg-teal/5 p-4">
      <div className="flex items-center gap-2">
        <Check size={15} className="text-teal" />
        <p className="text-sm font-medium text-dark">
          Added to quote. Quick question — why this one?
        </p>
        <span className="text-[11px] text-gray-400">(optional)</span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {CHOICE_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(reason === r ? null : r)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              reason === r
                ? "bg-teal text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder="Anything else? (never required)"
        className="mt-2.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal/30"
      />

      {pending.passedOn.length > 0 && (
        <div className="mt-3 pt-3 border-t border-teal/15">
          <p className="text-[12px] text-gray-600 mb-1.5">
            You looked at these but passed — any reason?{" "}
            <span className="text-gray-400">(optional)</span>
          </p>
          {pending.passedOn.map((o) => (
            <div key={o.id} className="mb-1.5">
              <p className="text-[11px] text-gray-500 mb-1">
                {o.brand ?? "Unbranded"} · {formatPrice(o.price)} ·{" "}
                {o.deliveryEstimate.label}
              </p>
              <div className="flex flex-wrap gap-1">
                {WHY_NOT_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() =>
                      setWhyNot((s) =>
                        s[o.id] === r
                          ? Object.fromEntries(
                              Object.entries(s).filter(([k]) => k !== o.id)
                            )
                          : { ...s, [o.id]: r }
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                      whyNot[o.id] === r
                        ? "bg-amber text-white"
                        : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          className="px-4 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal/90 transition"
        >
          Done
        </button>
        <button
          onClick={() =>
            onDone({ choiceReason: null, freeText: null, whyNot: [] })
          }
          className="px-3 py-1.5 rounded-lg text-gray-400 text-xs hover:text-gray-600 transition"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Candidate detail sheet ─────────────────────────────────────────

function CandidateSheet({
  offer,
  selectedPart,
  onPhotoOpen,
}: {
  offer: PublicOffer;
  selectedPart: Part;
  onPhotoOpen: () => void;
}) {
  const [photoLarge, setPhotoLarge] = useState(false);
  const embed = youtubeEmbedUrl(selectedPart.videoUrl);
  const searchHref = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${offer.brand ?? ""} ${selectedPart.name} install review`.trim()
  )}`;

  // Media rule: the curated listing photo renders only when approved
  // (photoUrl is null otherwise); manufacturer stock imagery is the
  // fallback and the preferred default.
  const photo = offer.photoUrl ?? selectedPart.imageUrl;
  const photoLabel = offer.photoUrl
    ? "Listing photo · curated"
    : "Manufacturer stock image";

  return (
    <div className="px-4 pb-4 pt-1 bg-gray-50/60 border-t border-gray-100">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        {/* Media */}
        <div>
          <button
            onClick={() => {
              setPhotoLarge((v) => !v);
              onPhotoOpen();
            }}
            className="block"
            aria-label="Enlarge photo"
          >
            <img
              src={photo}
              alt={selectedPart.name}
              className={`rounded-lg object-cover transition-all ${
                photoLarge ? "w-full h-56" : "w-40 h-28"
              }`}
            />
          </button>
          <p className="text-[10px] text-gray-400 mt-1">{photoLabel}</p>

          {embed && (
            <div className="mt-3">
              <iframe
                src={embed}
                title="Product video"
                className="w-full aspect-video rounded-lg border border-gray-200"
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          <a
            href={searchHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-block text-[11px] text-teal hover:underline"
          >
            Install &amp; review videos for {offer.brand ?? "this part"} &rarr;
          </a>
        </div>

        {/* Facts */}
        <div className="space-y-2.5 text-[12px]">
          <div className="flex items-center gap-2">
            <GradeTierBadge tier={offer.gradeTier} />
            {offer.provisional && (
              <span className="text-[11px] text-gray-400">
                newly onboarded supplier
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              Warranty
            </p>
            <p className="text-gray-700">{offer.warranty}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              Returns
            </p>
            <p className="text-gray-700">{offer.returnTerms}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              Fitment evidence
            </p>
            <p className="text-gray-700">{offer.fitmentEvidence}</p>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500 pt-1">
            <ShieldCheck size={13} className="text-teal shrink-0" />
            Fulfilled by Conneverse
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Candidate grid (copilot default view) ──────────────────────────

function PickTag({ offer }: { offer: PublicOffer }) {
  // Data-driven since v3: the label reflects what the pick actually is
  // (a slow-cheap primary under scheduled_week reads "Best Price"; a
  // next-best alternative with no speed/price edge reads neutral).
  const label = offer.pickLabel ?? "Also qualified";
  const style =
    label === "Ready Now"
      ? "bg-teal/10 text-teal"
      : label === "Best Price"
      ? "bg-amber/10 text-amber"
      : "bg-gray-100 text-gray-500";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style}`}
    >
      <Sparkles size={10} />
      Our pick — {label}
    </span>
  );
}

// ─── Sortable grid state ────────────────────────────────────────────

type SortKey = "brand" | "tier" | "warranty" | "delivery" | "price";
type SortState = { key: SortKey; dir: 1 | -1 } | null;

const SORT_ACCESSORS: Record<SortKey, (o: PublicOffer) => string | number> = {
  brand: (o) => (o.brand ?? "").toLowerCase(),
  tier: (o) => -TIER_RANK[o.gradeTier], // best grade first on first click
  warranty: (o) => o.warranty.toLowerCase(),
  delivery: (o) => o.deliveryEstimate.days,
  price: (o) => o.price,
};

function sortCandidates(
  candidates: PublicOffer[],
  sort: SortState
): PublicOffer[] {
  if (!sort) return candidates; // ranked order (picks pinned) by default
  const get = SORT_ACCESSORS[sort.key];
  return [...candidates].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (av < bv) return -sort.dir;
    if (av > bv) return sort.dir;
    return 0;
  });
}

/** Grid shows 7 rows by default; the rest sit behind an expander. */
const GRID_VISIBLE = 7;

function CandidateGrid({
  candidates,
  selectedPart,
  expanded,
  onToggleExpand,
  onSelect,
  onPhotoOpen,
}: {
  candidates: PublicOffer[];
  selectedPart: Part;
  expanded: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onSelect: (offer: PublicOffer) => void;
  onPhotoOpen: () => void;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () => sortCandidates(candidates, sort),
    [candidates, sort]
  );
  const visible = showAll ? sorted : sorted.slice(0, GRID_VISIBLE);
  const hidden = sorted.length - visible.length;

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s?.key === key
        ? s.dir === 1
          ? { key, dir: -1 }
          : null // third click returns to ranked order
        : { key, dir: 1 }
    );

  const header = (label: string, key: SortKey, right?: boolean) => (
    <button
      onClick={() => toggleSort(key)}
      className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-600 transition ${
        right ? "justify-end" : ""
      } ${sort?.key === key ? "text-gray-700 font-semibold" : ""}`}
    >
      {label}
      <ArrowUpDown
        size={9}
        className={sort?.key === key ? "opacity-100" : "opacity-40"}
      />
      {sort?.key === key && (
        <span className="text-[9px]">{sort.dir === 1 ? "↑" : "↓"}</span>
      )}
    </button>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
      {/* Header — sortable columns */}
      <div className="hidden md:grid grid-cols-[1fr_150px_120px_150px_90px_88px_32px] gap-2 px-4 py-2 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
        {header("Part / Brand", "brand")}
        {header("Grade tier", "tier")}
        {header("Warranty", "warranty")}
        {header("Delivery", "delivery")}
        <span className="text-right">{header("Price", "price", true)}</span>
        <span />
        <span />
      </div>

      {visible.map((o) => (
        <div key={o.id}>
          <div className="px-4 py-3">
            {(o.role === "A" || o.role === "B") && (
              <div className="mb-1.5">
                <PickTag offer={o} />
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-[1fr_150px_120px_150px_90px_88px_32px] gap-2 items-center">
              <div className="col-span-2 md:col-span-1 min-w-0">
                <p className="text-sm font-medium text-dark truncate">
                  {o.brand ?? "Unbranded"}{" "}
                  <span className="text-gray-400 font-normal">
                    · {conditionLabel(o.condition)}
                  </span>
                </p>
              </div>
              <div>
                <GradeTierBadge tier={o.gradeTier} />
              </div>
              <span className="text-[12px] text-gray-600">{o.warranty}</span>
              <span className="text-[12px] font-medium text-dark">
                {o.deliveryEstimate.label}
              </span>
              <span className="text-sm font-semibold text-dark md:text-right">
                {formatPrice(o.price)}
              </span>
              <button
                onClick={() => onSelect(o)}
                className="h-8 px-3 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal/90 active:scale-[0.98] transition"
              >
                Select
              </button>
              <button
                onClick={() => onToggleExpand(o.id)}
                aria-label="Details"
                className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform ${
                    expanded[o.id] ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>
          </div>
          {expanded[o.id] && (
            <CandidateSheet
              offer={o}
              selectedPart={selectedPart}
              onPhotoOpen={onPhotoOpen}
            />
          )}
        </div>
      ))}

      {hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2.5 text-xs font-medium text-teal hover:bg-teal/5 transition"
        >
          Show {hidden} more qualified match{hidden === 1 ? "" : "es"}
        </button>
      )}
      {showAll && sorted.length > GRID_VISIBLE && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full py-2.5 text-xs font-medium text-gray-400 hover:bg-gray-50 transition"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}

// ─── Assumption line + correction sheet ─────────────────────────────

const URGENCY_OPTIONS: Array<{ value: SearchUrgency; label: string }> = [
  { value: "on_lift", label: "Car on lift" },
  { value: "scheduled_48h", label: "Scheduled (48h)" },
  { value: "scheduled_week", label: "Scheduled (this week)" },
];

const TIER_OPTIONS: Array<{ value: string | null; label: string }> = [
  { value: null, label: "No preference" },
  { value: "oem_genuine", label: "OEM Genuine" },
  { value: "premium_aftermarket", label: "Premium aftermarket" },
  { value: "value_aftermarket", label: "Value aftermarket" },
];

/**
 * The quiet, tappable assumption line — "context, not knobs." One line
 * states what the optimizer assumed; tapping it opens a minimal
 * correction sheet (urgency + tier preference, this search only). Every
 * correction logs a preference label — the correction-sheet training
 * stream.
 */
function AssumptionLine({
  assumption,
  category,
}: {
  assumption: string;
  category: string;
}) {
  const { urgency, setUrgency, tierPreference, setTierPreference } =
    useSourcing();
  const { profile } = useShop();
  const [open, setOpen] = useState(false);

  const logPreference = (field: "urgency" | "tierPreference", value: string) => {
    fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId: profile?.shopName ?? "unknown-shop",
        category,
        field,
        value,
      }),
    }).catch(() => {
      // Label logging never blocks the flow.
    });
  };

  return (
    <div className="mb-4 -mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-gray-400 hover:text-gray-600 transition text-left"
      >
        {assumption} <span className="underline">Not right? Adjust</span>
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">
              When is the job?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {URGENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setUrgency(opt.value);
                    logPreference("urgency", opt.value);
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                    urgency === opt.value
                      ? "bg-[#1B2838] text-white"
                      : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">
              Quality preference (this search)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TIER_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => {
                    setTierPreference(opt.value);
                    if (opt.value) logPreference("tierPreference", opt.value);
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                    tierPreference === opt.value
                      ? "bg-[#1B2838] text-white"
                      : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-gray-400">
            Applies to this search — results re-rank instantly.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Two-pick cards (autopilot default view) ────────────────────────

function OfferingCard({
  offering,
  variant,
  selectedPart,
  savings,
  savingsPct,
  pulsing,
  onAdd,
}: {
  offering: PublicOffer;
  variant: "A" | "B";
  selectedPart: Part;
  savings: number;
  savingsPct: number;
  pulsing: boolean;
  onAdd: () => void;
}) {
  const isA = variant === "A";
  // v3: the label is data-driven — teal = Ready Now, amber = Best Price
  // regardless of which card slot the pick occupies. A next-best
  // alternative with no speed/price edge reads neutral.
  const label = offering.pickLabel ?? "Also qualified";
  const ready = label === "Ready Now";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
      <div className={ready ? "h-[3px] bg-teal" : "h-[3px] bg-amber"} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-1">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              ready ? "text-teal" : "text-amber"
            }`}
          >
            {label}
          </span>
          {!isA && savings > 0 && (
            <span className="text-[11px] font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">
              Save {formatPrice(savings)} ({savingsPct}%)
            </span>
          )}
        </div>
        <p className="text-base font-semibold text-dark">
          {offering.deliveryEstimate.label}
        </p>

        <hr className="my-3 border-gray-100" />

        <div className="flex flex-col items-center mb-3">
          <img
            src={offering.photoUrl ?? selectedPart.imageUrl}
            alt={selectedPart.name}
            className="w-[120px] h-[96px] rounded-lg object-cover"
          />
          <a
            href={selectedPart.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-1.5 text-[11px] hover:underline ${
              ready ? "text-teal" : "text-amber"
            }`}
          >
            &#9654; Watch product video
          </a>
        </div>

        <hr className="my-3 border-gray-100" />

        <p className="text-[15px] font-medium">{selectedPart.name}</p>
        <p className="text-[13px] text-gray-400 mt-0.5">
          {offering.brand ?? "—"} &middot; {conditionLabel(offering.condition)}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <GradeTierBadge tier={offering.gradeTier} />
          <span className="text-[11px] text-gray-500">{offering.warranty}</span>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[12px] text-gray-500">
          <ShieldCheck size={13} className="text-teal shrink-0" />
          <span>Fulfilled by Conneverse</span>
          {offering.provisional && (
            <span className="text-[11px] text-gray-400">· newly onboarded</span>
          )}
        </div>

        <hr className="my-3 border-gray-100" />

        <p className="text-[28px] font-bold text-[#1B2838]">
          {formatPrice(offering.price)}
        </p>
        {offering.shippingCost > 0 && (
          <p className="text-[11px] text-gray-400">
            Includes {formatPrice(offering.shippingCost)} shipping
          </p>
        )}

        <div className="mt-3">
          <GuaranteeBadges offering={offering} />
        </div>

        {!isA && (
          <p className="mt-2 text-[11px] text-gray-400">
            Same Conneverse guarantee as Option A.
          </p>
        )}

        <button
          onClick={onAdd}
          className={`mt-4 w-full h-11 rounded-lg ${
            ready ? "bg-teal hover:bg-teal/90" : "bg-amber hover:bg-amber/90"
          } text-white font-medium text-sm active:scale-[0.98] transition-all duration-150 ${
            pulsing ? "animate-pulse" : ""
          }`}
        >
          Add to Quote &rarr;
        </button>
      </div>
    </div>
  );
}

// ─── Dev-only debug panel ───────────────────────────────────────────

const GUARDRAIL_LABELS: Record<string, string> = {
  oe_family_mismatch: "OE/part-type mismatch",
  wrong_platform: "Wrong platform",
  universal_or_accessory: "Universal / accessory",
  junk_price: "Junk price (≤$1)",
  placeholder_part_number: "Placeholder part #",
  used_or_refurb_segmented: "Used / refurb (segmented)",
};

const GATE_LABELS: Record<string, string> = {
  out_of_stock: "Out of stock",
  not_fitment_verified: "Fitment not verified",
  below_reliability_floor: "Below reliability floor",
  quality_too_low: "Quality too low",
  missing_price: "Missing price",
  missing_delivery: "Missing delivery",
};

function DebugPanel({
  debug,
}: {
  debug: NonNullable<ReturnType<typeof useSourcing>["aggregate"]>["debug"];
}) {
  const [open, setOpen] = useState(false);
  if (!debug) return null;

  const rows = (obj: Record<string, number>, labels: Record<string, string>) =>
    Object.entries(obj)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => (
        <div key={k} className="flex justify-between text-[11px]">
          <span className="text-gray-500">{labels[k] ?? k}</span>
          <span className="tabular-nums text-gray-700">{n}</span>
        </div>
      ));

  const guardrailRows = rows(debug.guardrailRejections, GUARDRAIL_LABELS);
  const gateRows = rows(debug.gateRejections, GATE_LABELS);

  return (
    <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-gray-500 hover:text-gray-700"
      >
        <Bug size={12} />
        Debug — why candidates were dropped
        <span className="ml-auto text-gray-400">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-gray-200/70 text-[11px]">
            <span className="text-gray-500">Match strategy:</span>
            <span
              className={`font-medium ${
                debug.matchStrategy === "oe_hard"
                  ? "text-teal"
                  : "text-gray-600"
              }`}
            >
              {debug.matchStrategy === "oe_hard" ? "OE hard-match" : "keyword"}
            </span>
            {debug.matchStrategy === "oe_hard" && debug.oeNumbers[0] && (
              <span className="text-gray-400 tabular-nums">
                · {debug.oeNumbers[0]}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Guardrails (pre-optimizer)
              </p>
              {guardrailRows.length > 0 ? (
                guardrailRows
              ) : (
                <p className="text-[11px] text-gray-400">none</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Gates (optimizer)
              </p>
              {gateRows.length > 0 ? (
                gateRows
              ) : (
                <p className="text-[11px] text-gray-400">none</p>
              )}
              {debug.policyHits > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Account policy blocked</span>
                  <span className="tabular-nums text-gray-700">
                    {debug.policyHits}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* v3: context-derived weights (server-side only — never a UI knob) */}
          <div className="mt-3 pt-2 border-t border-gray-200/70">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              Derived weights (context → optimizer)
            </p>
            <div className="flex gap-4 text-[11px] tabular-nums">
              {(
                [
                  ["price", debug.weights.price],
                  ["reliability", debug.weights.reliability],
                  ["delivery", debug.weights.delivery],
                  ["fitment", debug.weights.fitment],
                ] as const
              ).map(([k, v]) => (
                <span key={k} className="text-gray-600">
                  <span className="text-gray-400">{k}</span> {v.toFixed(2)}
                </span>
              ))}
            </div>
          </div>

          {/* v3: score decomposition for the ranked survivors */}
          {debug.scores.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-200/70 overflow-x-auto">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                Score decomposition (weighted components)
              </p>
              <table className="w-full text-[10px] tabular-nums">
                <thead>
                  <tr className="text-gray-400 text-left">
                    <th className="pr-2 font-normal">brand</th>
                    <th className="pr-2 font-normal text-right">price</th>
                    <th className="pr-2 font-normal text-right">reliab.</th>
                    <th className="pr-2 font-normal text-right">deliv.</th>
                    <th className="pr-2 font-normal text-right">fitment</th>
                    <th className="pr-2 font-normal text-right">bonus</th>
                    <th className="font-normal text-right">total</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  {debug.scores.slice(0, 8).map((s) => (
                    <tr key={s.offeringId}>
                      <td className="pr-2 truncate max-w-[120px]">
                        {s.brand ?? "—"}
                      </td>
                      <td className="pr-2 text-right">{s.price.toFixed(3)}</td>
                      <td className="pr-2 text-right">
                        {s.reliability.toFixed(3)}
                      </td>
                      <td className="pr-2 text-right">
                        {s.delivery.toFixed(3)}
                      </td>
                      <td className="pr-2 text-right">
                        {s.fitment.toFixed(3)}
                      </td>
                      <td className="pr-2 text-right">{s.bonus.toFixed(3)}</td>
                      <td className="text-right font-medium text-gray-700">
                        {s.score.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── The results zone ───────────────────────────────────────────────

export function ResultCards() {
  const {
    isSearching,
    aggregating,
    aggregate,
    aggregateError,
    selectedPart,
    resultsVisible,
    optionA,
    optionB,
    hasResults,
    savings,
    savingsPct,
    addToQuote,
    make,
    model,
    year,
  } = useSourcing();
  const { profile, getSourcingMode } = useShop();

  const mode = selectedPart ? getSourcingMode(selectedPart.category) : "copilot";

  const [view, setView] = useState<"grid" | "picks">("grid");
  const [pulsingButton, setPulsingButton] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(
    null
  );

  // Implicit signals for the choice record.
  const expandedEverRef = useRef<string[]>([]);
  const photoOpensRef = useRef(0);
  const shownAtRef = useRef<number>(Date.now());

  // Reset per new result set; default view follows the shop's mode.
  useEffect(() => {
    setView(mode === "copilot" ? "grid" : "picks");
    setExpanded({});
    setPendingChoice(null);
    expandedEverRef.current = [];
    photoOpensRef.current = 0;
    shownAtRef.current = Date.now();
  }, [aggregate, mode]);

  const logChoice = useCallback(
    (
      picked: PublicOffer,
      labels: {
        choiceReason: string | null;
        freeText: string | null;
        whyNot: Array<{ offerId: string; reason: string }>;
      }
    ) => {
      if (!selectedPart) return;
      // Structured deltas: picked − recommended (A). What did the human
      // trade when they overrode? Feeds priceSensitivity learning.
      const disagreed = optionA && picked.id !== optionA.id;
      fetch("/api/choices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: profile?.shopName ?? "unknown-shop",
          category: selectedPart.category,
          partId: selectedPart.id,
          pickedOfferId: picked.id,
          pickedRole: picked.role,
          recommendedOfferId: optionA?.id ?? null,
          agreement: picked.role !== "candidate",
          deltaPrice: disagreed
            ? Math.round((picked.price - optionA.price) * 100) / 100
            : null,
          deltaDelivery: disagreed
            ? picked.deliveryEstimate.days - optionA.deliveryEstimate.days
            : null,
          choiceReason: labels.choiceReason,
          freeText: labels.freeText,
          whyNot: labels.whyNot,
          expandedOfferIds: expandedEverRef.current,
          photoOpens: photoOpensRef.current,
          dwellMs: Date.now() - shownAtRef.current,
        }),
      }).catch(() => {
        // Label logging must never block the sourcing flow.
      });
    },
    [selectedPart, profile?.shopName, optionA]
  );

  const busy = isSearching || aggregating;
  if (busy || !selectedPart) return null;

  if (aggregateError) {
    return (
      <div className="max-w-[860px] mx-auto mt-6">
        <div className="bg-white rounded-xl border border-red-200 p-6 text-center">
          <p className="text-sm font-medium text-red-700 mb-1">
            Couldn&rsquo;t load offerings.
          </p>
          <p className="text-xs text-gray-500">{aggregateError}</p>
        </div>
      </div>
    );
  }

  if (!aggregate) return null;

  const candidates = aggregate.candidates ?? [];

  const handleToggleExpand = (id: string) => {
    setExpanded((s) => {
      const next = { ...s, [id]: !s[id] };
      if (next[id] && !expandedEverRef.current.includes(id)) {
        expandedEverRef.current.push(id);
      }
      return next;
    });
  };

  const handleSelect = (offer: PublicOffer) => {
    addToQuote(offer, selectedPart, quoteOption(offer));
    setPulsingButton(offer.role);
    setTimeout(() => setPulsingButton(null), 600);

    if (mode === "copilot") {
      // Chips panel (optional, non-blocking — the part is already in
      // the quote). Why-not targets: expanded but not picked.
      const passedOn = candidates.filter(
        (c) => c.id !== offer.id && expandedEverRef.current.includes(c.id)
      );
      setPendingChoice({ picked: offer, passedOn });
    } else {
      // Autopilot: log silently — agreement data keeps accruing.
      logChoice(offer, { choiceReason: null, freeText: null, whyNot: [] });
    }
  };

  const viewToggle = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setView("grid")}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
          view === "grid"
            ? "bg-[#1B2838] text-white"
            : "text-gray-500 hover:bg-gray-100"
        }`}
      >
        <LayoutGrid size={11} />
        All matches ({candidates.length})
      </button>
      <button
        onClick={() => setView("picks")}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
          view === "picks"
            ? "bg-[#1B2838] text-white"
            : "text-gray-500 hover:bg-gray-100"
        }`}
      >
        <Rows3 size={11} />
        Top picks
      </button>
    </div>
  );

  return (
    <div
      className={`max-w-[860px] mx-auto mt-6 transition-opacity duration-300 ${
        resultsVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Funnel header — directive 7 language */}
      <div className="bg-teal/5 rounded-lg border border-teal/15 px-4 py-3 mb-4">
        <div className="flex items-start gap-2.5 text-sm">
          <Sparkles size={16} className="text-teal mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-dark font-medium">
              {aggregate.meta.metQualityBar} match
              {aggregate.meta.metQualityBar === 1 ? "" : "es"} met the
              Conneverse quality bar
              {aggregate.meta.belowBar > 0 && (
                <>
                  {" "}
                  · {aggregate.meta.belowBar} didn&rsquo;t and aren&rsquo;t
                  shown
                </>
              )}
              .
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Compared {aggregate.meta.considered} offerings across{" "}
              {aggregate.meta.sourcesSearched} source
              {aggregate.meta.sourcesSearched === 1 ? "" : "s"} in{" "}
              {(aggregate.meta.durationMs / 1000).toFixed(1)}s
              {hasResults ? "." : "."}
            </p>
          </div>
        </div>
      </div>

      {/* v3 assumption line — quiet, tappable, corrections re-rank */}
      {aggregate.meta.assumption && (
        <AssumptionLine
          assumption={aggregate.meta.assumption}
          category={selectedPart.category}
        />
      )}

      {hasResults ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] text-gray-500">
              {view === "grid"
                ? "Compare the qualified matches — our picks are tagged."
                : "Our two picks. The full comparison is one click away."}
            </p>
            {viewToggle}
          </div>

          {view === "grid" ? (
            <CandidateGrid
              candidates={candidates}
              selectedPart={selectedPart}
              expanded={expanded}
              onToggleExpand={handleToggleExpand}
              onSelect={handleSelect}
              onPhotoOpen={() => {
                photoOpensRef.current++;
              }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {optionA && (
                <OfferingCard
                  offering={optionA}
                  variant="A"
                  selectedPart={selectedPart}
                  savings={savings}
                  savingsPct={savingsPct}
                  pulsing={pulsingButton === "A"}
                  onAdd={() => handleSelect(optionA)}
                />
              )}
              {optionB && (
                <OfferingCard
                  offering={optionB}
                  variant="B"
                  selectedPart={selectedPart}
                  savings={savings}
                  savingsPct={savingsPct}
                  pulsing={pulsingButton === "B"}
                  onAdd={() => handleSelect(optionB)}
                />
              )}
            </div>
          )}

          {pendingChoice && (
            <ChoiceCapture
              pending={pendingChoice}
              onDone={(labels) => {
                logChoice(pendingChoice.picked, labels);
                setPendingChoice(null);
              }}
            />
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-base font-medium text-gray-700 mb-2">
            No quality-verified options for this part right now.
          </p>
          <p className="text-sm text-gray-400 mb-3 max-w-md mx-auto">
            We searched {aggregate.meta.considered} listings across{" "}
            {aggregate.meta.sourcesSearched} source
            {aggregate.meta.sourcesSearched === 1 ? "" : "s"}.{" "}
            {aggregate.meta.metQualityBar} met the Conneverse quality bar
            &mdash; but none cleared our standards for {year} {make} {model}.
          </p>
          <p className="text-xs text-gray-400">
            Try another part, or check back later as suppliers refresh
            inventory.
          </p>
        </div>
      )}

      <DebugPanel debug={aggregate.debug} />
    </div>
  );
}
