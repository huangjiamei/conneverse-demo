"use client";

/**
 * ClaimFlow — the warranty/returns claim, three steps:
 *
 *   1. Reason chips (doesn't fit / failed after install / arrived
 *      damaged / no longer needed) + optional photo. Part, vehicle,
 *      order date, warranty window are pre-filled — never retyped.
 *   2. Instant resolution: line totals ≤ the shop's auto-approve limit
 *      approve immediately (replacement default, refund optional);
 *      pickup bundles with the next delivery; credit memo generated;
 *      RMA created server-side, never displayed. Above the limit →
 *      under review, answer within 4 business hours.
 *   3. The claim renders as its own mini-tracker on the order card
 *      (Approved → Replacement shipped → Old part picked up → Credited).
 */

import { useState } from "react";
import { Camera, Check, X } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type {
  ClaimReason,
  ClaimResolution,
  OrderLine,
  PublicClaim,
  PublicOrder,
} from "@/types/canonical";

const REASON_CHIPS: Array<{ id: ClaimReason; label: string }> = [
  { id: "doesnt_fit", label: "doesn't fit" },
  { id: "failed_after_install", label: "failed after install" },
  { id: "arrived_damaged", label: "arrived damaged" },
  { id: "no_longer_needed", label: "no longer needed" },
];

export function ClaimFlow({
  order,
  line,
  onDone,
  onCancel,
}: {
  order: PublicOrder;
  line: OrderLine;
  onDone: (claim: PublicClaim) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<ClaimReason | null>(null);
  const [resolution, setResolution] = useState<ClaimResolution>("replacement");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PublicClaim | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          lineId: line.id,
          reason,
          resolution,
          photoRef: photoName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setResult(data as PublicClaim);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 2 result state
  if (result) {
    return (
      <div className="mt-3 rounded-lg border border-teal/20 bg-teal/5 p-4">
        {result.autoApproved ? (
          <>
            <p className="text-sm font-semibold text-teal flex items-center gap-1.5">
              <Check size={15} />
              Approved instantly.
            </p>
            <p className="mt-1 text-[12px] text-gray-600">
              {result.resolution === "replacement"
                ? "A replacement is on the way."
                : "A refund is being issued."}{" "}
              Pickup of the old part is bundled with your next delivery.
              Credit memo {result.creditMemoId} has been generated.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-dark">Under review.</p>
            <p className="mt-1 text-[12px] text-gray-600">
              This one&rsquo;s above your auto-approve limit — you&rsquo;ll
              have an answer within 4 business hours.
            </p>
          </>
        )}
        <button
          onClick={() => onDone(result)}
          className="mt-2.5 px-4 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal/90 transition"
        >
          Done
        </button>
      </div>
    );
  }

  // Step 1 — everything pre-filled; user only picks a reason.
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/70 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-dark">Report a problem</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {line.partName} · {line.brand} ·{" "}
            {formatPrice(line.unitPricePaid * line.qty)} ·{" "}
            {order.vehicle.year} {order.vehicle.make} {order.vehicle.model} ·
            ordered{" "}
            {new Date(order.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Cancel claim"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {REASON_CHIPS.map((r) => (
          <button
            key={r.id}
            onClick={() => setReason(reason === r.id ? null : r.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              reason === r.id
                ? "bg-[#1B2838] text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer hover:text-gray-700">
          <Camera size={13} />
          {photoName ?? "Add a photo (optional)"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) =>
              setPhotoName(e.target.files?.[0]?.name ?? null)
            }
          />
        </label>

        <div className="flex items-center gap-1 text-[11px]">
          {(["replacement", "refund"] as ClaimResolution[]).map((r) => (
            <button
              key={r}
              onClick={() => setResolution(r)}
              className={`rounded-full px-2.5 py-1 transition ${
                resolution === r
                  ? "bg-teal/10 text-teal font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!reason || submitting}
          className="px-4 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal/90 transition disabled:opacity-40"
        >
          {submitting ? "Submitting…" : "Submit claim"}
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    </div>
  );
}

// ─── Claim mini-tracker (step 3) ────────────────────────────────────

const CLAIM_FLOW: Array<{ id: PublicClaim["status"]; label: string }> = [
  { id: "approved", label: "Approved" },
  { id: "replacement_shipped", label: "Replacement shipped" },
  { id: "picked_up", label: "Old part picked up" },
  { id: "credited", label: "Credited" },
];

export function ClaimTracker({
  claim,
  onAdvance,
}: {
  claim: PublicClaim;
  onAdvance: (claimId: string, status: PublicClaim["status"]) => void;
}) {
  if (claim.status === "under_review") {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber/10 px-3 py-2">
        <span className="text-[11px] font-medium text-amber">
          Claim under review — answer within 4 business hours
        </span>
        <button
          onClick={() => onAdvance(claim.id, "approved")}
          className="ml-auto px-2.5 py-1 rounded bg-teal text-white text-[10px] font-medium hover:bg-teal/90"
        >
          Approve (ops)
        </button>
      </div>
    );
  }

  const reachedIdx = CLAIM_FLOW.findIndex((s) => s.id === claim.status);
  const next = CLAIM_FLOW[reachedIdx + 1];

  return (
    <div className="mt-2 flex items-center gap-1 flex-wrap rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-1">
        Claim
      </span>
      {CLAIM_FLOW.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              i <= reachedIdx
                ? "bg-teal/10 text-teal"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {i <= reachedIdx && <Check size={8} className="inline mr-0.5" />}
            {s.label}
          </span>
          {i < CLAIM_FLOW.length - 1 && (
            <div
              className={`w-3 h-px ${
                i < reachedIdx ? "bg-teal/40" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
      {next && (
        <button
          onClick={() => onAdvance(claim.id, next.id)}
          className="ml-auto px-2.5 py-1 rounded border border-gray-200 text-[10px] text-gray-600 font-medium hover:bg-white"
        >
          Mark {next.label.toLowerCase()}
        </button>
      )}
    </div>
  );
}
