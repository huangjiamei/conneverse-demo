"use client";

/** One line in the quote builder (shared by sidebar and mobile drawer). */

import { Minus, Plus, Trash2 } from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";
import { formatPrice } from "@/lib/format";
import type { QuoteLine } from "@/types";

export function QuoteLineItem({ line }: { line: QuoteLine }) {
  const { updateQty, removeItem } = useSourcing();

  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="flex items-start justify-between">
        <div>
          <span
            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
              line.option === "A"
                ? "bg-teal/10 text-teal"
                : "bg-amber/10 text-amber"
            }`}
          >
            Option {line.option}
          </span>
          <p className="text-sm font-medium mt-1">
            {line.partName}
          </p>
          <p className="text-xs text-gray-400">{line.brand}</p>
        </div>
        <button
          onClick={() => removeItem(line.id)}
          className="text-gray-300 hover:text-red-500 transition"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => updateQty(line.id, -1)}
            className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
          >
            <Minus size={12} />
          </button>
          <span className="text-sm font-medium w-6 text-center">
            {line.qty}
          </span>
          <button
            onClick={() => updateQty(line.id, 1)}
            className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
          >
            <Plus size={12} />
          </button>
        </div>
        <span className="text-sm font-semibold">
          {formatPrice(line.price * line.qty)}
        </span>
      </div>
    </div>
  );
}
