"use client";

/**
 * Quote builder shells: the desktop sidebar (QuoteCart) and the mobile
 * bottom bar + slide-up drawer (MobileQuoteBar). Line items and totals
 * are shared components.
 */

import { useState } from "react";
import { FileText, ShoppingCart, X } from "lucide-react";
import { useSourcing } from "@/context/SourcingContext";
import { formatPrice } from "@/lib/format";
import { QuoteLineItem } from "./QuoteLineItem";
import { QuoteTotals } from "./QuoteTotals";

export function QuoteCart() {
  const { quoteItems } = useSourcing();

  return (
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
              <QuoteLineItem key={qi.id} line={qi} />
            ))}
          </div>
        )}

        <QuoteTotals variant="sidebar" />
      </div>
    </aside>
  );
}

export function MobileQuoteBar() {
  const { quoteItems, grandTotal } = useSourcing();
  const [showQuoteDrawer, setShowQuoteDrawer] = useState(false);

  return (
    <>
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
                  <QuoteLineItem key={qi.id} line={qi} />
                ))}
              </div>
            )}

            <QuoteTotals variant="drawer" />
          </div>
        </div>
      )}
    </>
  );
}
