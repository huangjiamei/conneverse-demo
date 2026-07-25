"use client";

/**
 * Quote Builder 侧栏 —— 读 SourcingContext 里选中的候选 + 报价参数, 算并展示。
 *
 * 结构:
 *   RECOMMENDED     → primary 候选卡片
 *   ALTERNATIVES(X/2) → 备选候选卡片
 *   Labor hours / rate / tax rate 输入
 *   Parts subtotal / Labor / Tax / Grand Total
 *
 * 纯前端, 不落库。Place Order / Generate PDF 仍是 disabled stub (PDF 下一步)。
 */

import { useState } from "react";
import { FileText, Loader2, Minus, Plus, X } from "lucide-react";
import { useSourcing } from "./SourcingContext";
import { type Candidate } from "@/components/CandidateCard";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function QuoteBuilder() {
  const s = useSourcing();
  const hasSelection = s.primary != null || s.alternatives.length > 0;
  const [generating, setGenerating] = useState(false);

  // 点 Generate PDF: 动态 import react-pdf (避免进主 bundle), 生成 Blob 下载
  async function handleGeneratePDF() {
    const primary = s.primary;
    if (!primary) return;
    setGenerating(true);
    try {
      const [{ pdf }, { QuotePDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/QuotePDF"),
      ]);

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}${mm}${dd}`;
      const vehicleLabel = s.vehicleLabel ?? "Vehicle";
      const partDescription = s.partDescription ?? "";

      const blob = await pdf(
        <QuotePDF
          vehicleLabel={vehicleLabel}
          partDescription={partDescription}
          primary={primary}
          alternatives={s.alternatives}
          quantities={s.quantities}
          laborHours={s.laborHours}
          laborRate={s.laborRate}
          taxRate={s.taxRate}
          partsSubtotal={s.partsSubtotal}
          laborTotal={s.laborTotal}
          tax={s.tax}
          grandTotal={s.grandTotal}
          quoteNumber={`Q-${yyyy}-${dateStr}`}
          dateDisplay={now.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          generatedAt={now.toLocaleString("en-US")}
        />
      ).toBlob();

      const slug = vehicleLabel.replace(/[()]/g, "").replace(/\s+/g, "-");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Conneverse-Quote-${slug}-${dateStr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-gray-500" />
        <h2 className="text-base font-medium text-[#1A1A2E]">Quote Builder</h2>
      </div>

      {!hasSelection ? (
        <div className="text-xs text-gray-400 py-4 text-center">
          Select a candidate to build your quote
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {s.primary && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 mb-1.5">
                Recommended
              </div>
              <LineItem candidate={s.primary} />
            </div>
          )}

          {s.alternatives.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Alternatives ({s.alternatives.length}/2)
              </div>
              <div className="space-y-2">
                {s.alternatives.map((c) => (
                  <LineItem key={c.id} candidate={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Labor + Tax 参数 */}
      <div className="border-t border-gray-100 mt-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-600">Labor hours</label>
          <Stepper
            value={s.laborHours}
            onChange={s.updateLaborHours}
            step={0.5}
            min={0}
            max={40}
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-600">Labor rate ($/hr)</label>
          <NumberInput value={s.laborRate} onChange={s.updateLaborRate} min={0} />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-600">Tax rate (%)</label>
          <NumberInput
            value={s.taxRate}
            onChange={s.updateTaxRate}
            min={0}
            step={0.05}
          />
        </div>
      </div>

      {/* 金额 */}
      <div className="border-t border-gray-100 mt-4 pt-4 space-y-2">
        <Row
          label="Parts subtotal (recommended)"
          value={usd.format(s.partsSubtotal)}
        />
        <Row
          label={`Labor (${s.laborHours}h × ${usd.format(s.laborRate)})`}
          value={usd.format(s.laborTotal)}
        />
        <Row label={`Tax (${s.taxRate}%)`} value={usd.format(s.tax)} />
        <Row label="Grand Total" value={usd.format(s.grandTotal)} strong />
      </div>

      {/* 操作 (stub) */}
      <div className="mt-5 space-y-2">
        <button
          disabled
          title="Order flow coming soon"
          className="w-full py-2 rounded-lg bg-gray-200 text-gray-500 text-sm font-medium cursor-not-allowed"
        >
          Place Order
        </button>
        <button
          onClick={handleGeneratePDF}
          disabled={!s.primary || generating}
          title={!s.primary ? "Select a recommended part first" : undefined}
          className="w-full py-2 rounded-lg bg-[#1A1A2E] text-white text-sm font-medium hover:bg-[#252540] disabled:opacity-50 disabled:cursor-not-allowed transition inline-flex items-center justify-center gap-2"
        >
          {generating && <Loader2 size={14} className="animate-spin" />}
          {generating ? "Generating…" : "Generate PDF Quote"}
        </button>
      </div>

      <p className="mt-3 text-[10px] text-gray-400 text-center leading-snug">
        PDF shows both options so your customer can choose.
      </p>
    </div>
  );
}

// ============================================================
// 单条候选行
// ============================================================

function LineItem({ candidate }: { candidate: Candidate }) {
  const s = useSourcing();
  const qty = s.quantities[candidate.id] ?? 1;
  const unit = Number(candidate.price);
  const subtotal = unit * qty;

  // 备选相对主推的单价差价 (有主推 且 这条不是主推时才显示)
  const isThisPrimary = s.primary?.id === candidate.id;
  const diff =
    s.primary && !isThisPrimary ? unit - Number(s.primary.price) : null;

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-gray-500">
            {candidate.brand ?? "—"}
            {candidate.condition ? ` · ${candidate.condition}` : ""}
          </div>
          <div className="text-xs text-[#1A1A2E] leading-snug line-clamp-2">
            {candidate.title}
          </div>
        </div>
        <button
          onClick={() => s.remove(candidate.id)}
          aria-label="Remove"
          className="shrink-0 text-gray-300 hover:text-red-600 transition"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <Stepper
          value={qty}
          onChange={(v) => s.updateQuantity(candidate.id, v)}
          step={1}
          min={1}
          max={99}
        />
        <div className="text-right">
          <div className="text-[11px] text-gray-400">
            {usd.format(unit)}/ea
          </div>
          <div className="text-sm font-semibold text-[#1A1A2E] tabular-nums">
            {usd.format(subtotal)}
          </div>
        </div>
      </div>

      {/* vs recommended 差价 (只备选显示) */}
      {diff != null && diff !== 0 && (
        <div
          className={`mt-1.5 text-[11px] font-medium tabular-nums ${
            diff < 0 ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {diff < 0 ? "−" : "+"}
          {usd.format(Math.abs(diff))} vs recommended
        </div>
      )}
      {diff === 0 && (
        <div className="mt-1.5 text-[11px] text-gray-400">
          Same price as recommended
        </div>
      )}
    </div>
  );
}

// ============================================================
// 小控件
// ============================================================

function Stepper({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition"
        aria-label="Decrease"
      >
        <Minus size={12} />
      </button>
      <span className="w-8 text-center text-sm tabular-nums text-[#1A1A2E]">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition"
        aria-label="Increase"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) onChange(n);
      }}
      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right tabular-nums focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
    />
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={`${strong ? "text-[#1A1A2E] font-medium text-sm" : "text-gray-500 text-xs"}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? "text-sm font-semibold text-[#1A1A2E]" : "text-xs text-gray-700"}`}
      >
        {value}
      </span>
    </div>
  );
}
