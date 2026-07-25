"use client";

/**
 * Quote Builder 侧栏 (Step 1 骨架版)。
 *
 * 现在完全独立、无外部依赖:
 *   - Parts 相关数字都是 stub $0.00 (还没接候选选择, 那是后续 Step)
 *   - 只有 labor hours 是真实可调的本地 state, 联动 Labor / Tax / Grand Total
 *   - Place Order / Generate PDF Quote 都是 disabled stub
 *
 * 后续 Step 会把它接到全局 SourcingContext 拿实际选中的候选。
 */

import { useState } from "react";
import { FileText, Minus, Plus } from "lucide-react";

const LABOR_RATE = 133; // $/hr
const TAX_RATE = 0.0875; // 8.75%

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function QuoteBuilder() {
  const [laborHours, setLaborHours] = useState(0);

  // Parts 还没接候选, 先当 0
  const partsTotal = 0;
  const laborCost = laborHours * LABOR_RATE;
  const subtotal = partsTotal + laborCost;
  const tax = subtotal * TAX_RATE;
  const grandTotal = subtotal + tax;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-gray-500" />
        <h2 className="text-base font-medium text-[#1A1A2E]">Quote Builder</h2>
      </div>

      {/* 空状态 (还没选候选) */}
      <div className="text-xs text-gray-400 py-4 text-center">
        Add parts from the results to build a quote.
      </div>

      {/* Labor hours 步进器 */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-600">Labor hours</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLaborHours((h) => Math.max(0, h - 0.5))}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition"
              aria-label="Decrease labor hours"
            >
              <Minus size={12} />
            </button>
            <span className="w-10 text-center text-sm tabular-nums text-[#1A1A2E]">
              {laborHours}
            </span>
            <button
              onClick={() => setLaborHours((h) => h + 0.5)}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition"
              aria-label="Increase labor hours"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
        <div className="mt-1 text-right text-[11px] text-gray-400 tabular-nums">
          × {usd.format(LABOR_RATE)}/hr = {usd.format(laborCost)}
        </div>
      </div>

      {/* 金额三行 */}
      <div className="border-t border-gray-100 mt-4 pt-4 space-y-2">
        <Row label="Labor" value={usd.format(laborCost)} />
        <Row label="Tax (8.75%)" value={usd.format(tax)} />
        <Row label="Grand Total" value={usd.format(grandTotal)} strong />
      </div>

      {/* 操作按钮 */}
      <div className="mt-5 space-y-2">
        <button
          disabled
          title="Ordering coming soon"
          className="w-full py-2 rounded-lg bg-teal-500 text-white text-sm font-medium opacity-50 cursor-not-allowed"
        >
          Place Order
        </button>
        <button
          disabled
          title="PDF export coming soon"
          className="w-full py-2 rounded-lg bg-[#1A1A2E] text-white text-sm font-medium opacity-60 cursor-not-allowed"
        >
          Generate PDF Quote
        </button>
      </div>

      <p className="mt-3 text-[10px] text-gray-400 text-center leading-snug">
        PDF shows both options so your customer can choose.
      </p>
    </div>
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
    <div className="flex items-baseline justify-between">
      <span className={`text-xs ${strong ? "text-[#1A1A2E] font-medium" : "text-gray-500"}`}>
        {label}
      </span>
      <span
        className={`tabular-nums ${
          strong ? "text-sm font-semibold text-[#1A1A2E]" : "text-xs text-gray-700"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
