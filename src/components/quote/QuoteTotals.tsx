"use client";

/**
 * Labor control, totals (subtotals / labor / tax / grand total), the
 * PDF export button, and Clear All. Shared by the desktop sidebar and
 * the mobile drawer; the sidebar variant additionally shows the labor
 * rate line and the PDF footnote.
 */

import { Minus, Plus } from "lucide-react";
import { SHOP_CONFIG } from "@/data/shop-config";
import { useShop } from "@/context/ShopContext";
import { useSourcing } from "@/context/SourcingContext";
import { formatPrice } from "@/lib/format";

export function QuoteTotals({ variant }: { variant: "sidebar" | "drawer" }) {
  const { profile } = useShop();
  const {
    quoteItems,
    laborHours,
    setLaborHours,
    clearQuote,
    optionAItems,
    optionBItems,
    optionASubtotal,
    optionBSubtotal,
    laborRate,
    laborTotal,
    tax,
    grandTotal,
    vehicleSelected,
    make,
    model,
    year,
    contextProvider,
  } = useSourcing();

  async function handleGeneratePdf() {
    if (!profile) return;
    const { generateQuotePDF } = await import("@/lib/generate-quote-pdf");
    generateQuotePDF({
      optionA:
        optionAItems.length > 0
          ? {
              label: "Option A — Ready in 2 Hours",
              deliveryLabel: optionAItems[0]?.deliveryLabel ?? "",
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
              deliveryLabel: optionBItems[0]?.deliveryLabel ?? "",
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
    contextProvider.onQuoteComplete(quoteItems);
  }

  return (
    <>
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
        {variant === "sidebar" && (
          <p className="text-xs text-gray-400 text-right mt-0.5">
            &times; ${laborRate}/hr = {formatPrice(laborTotal)}
          </p>
        )}
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
        onClick={handleGeneratePdf}
        className="mt-4 w-full h-11 rounded-lg bg-[#1B2838] text-white font-medium text-sm hover:bg-[#1B2838]/90 transition"
      >
        Generate PDF Quote
      </button>

      {quoteItems.length > 0 && (
        <button
          onClick={clearQuote}
          className="mt-2 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition"
        >
          Clear All
        </button>
      )}

      {variant === "sidebar" && (
        <p className="mt-3 text-[12px] text-gray-400 text-center">
          PDF shows both options so your customer can choose.
        </p>
      )}
    </>
  );
}
