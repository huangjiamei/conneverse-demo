"use client";

/**
 * Labor control, totals (subtotals / labor / tax / grand total), the
 * PDF export button, and Clear All. Shared by the desktop sidebar and
 * the mobile drawer; the sidebar variant additionally shows the labor
 * rate line and the PDF footnote.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, PackageCheck, Plus } from "lucide-react";
import { SHOP_CONFIG } from "@/data/shop-config";
import { useShop } from "@/context/ShopContext";
import { useSourcing } from "@/context/SourcingContext";
import { formatPrice } from "@/lib/format";

export function QuoteTotals({ variant }: { variant: "sidebar" | "drawer" }) {
  const router = useRouter();
  const { profile } = useShop();
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [onLift, setOnLift] = useState(false);
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

  async function handlePlaceOrder() {
    if (!profile || quoteItems.length === 0 || !vehicleSelected) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: profile.shopName,
          vehicle: { year: year as number, make, model },
          urgency: onLift ? "on_lift" : "scheduled",
          lines: quoteItems.map((qi) => ({
            offerId: qi.offerId,
            catalogPartId: qi.catalogPartId,
            partName: qi.partName,
            partNumber: qi.partNumber,
            brand: qi.brand,
            gradeTier: qi.gradeTier,
            condition: qi.condition ?? "new",
            qty: qi.qty,
            unitPrice: qi.price,
            deliveryDays: qi.deliveryDays,
            marketBaseline: qi.marketBaseline ?? null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      contextProvider.onQuoteComplete(quoteItems);
      clearQuote();
      router.push("/orders");
    } catch (err) {
      setPlaceError(
        err instanceof Error ? err.message : "Couldn't place the order"
      );
    } finally {
      setPlacing(false);
    }
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

      {/* Urgency — on_lift orders sort first and get the loudest delay
          treatment on the orders board. */}
      <label className="mt-4 flex items-center gap-2 text-[12px] text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={onLift}
          onChange={(e) => setOnLift(e.target.checked)}
          className="accent-[#2EC4B6]"
        />
        Car is on the lift (rush)
      </label>

      {/* Place order */}
      <button
        onClick={handlePlaceOrder}
        disabled={placing || quoteItems.length === 0}
        className="mt-4 w-full h-11 rounded-lg bg-teal text-white font-medium text-sm hover:bg-teal/90 active:scale-[0.98] transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {placing ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <PackageCheck size={15} />
        )}
        Place Order
      </button>
      {placeError && (
        <p className="mt-1.5 text-[11px] text-red-600 text-center">
          {placeError}
        </p>
      )}

      {/* The Place Order button follows the urgency toggle above; PDF
          quote remains for the customer-facing dual-option flow. */}
      <button
        onClick={handleGeneratePdf}
        className="mt-2 w-full h-11 rounded-lg bg-[#1B2838] text-white font-medium text-sm hover:bg-[#1B2838]/90 transition"
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
