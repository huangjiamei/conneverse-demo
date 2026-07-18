/**
 * Purchase-order PDF — one PO per supplier group, generated client-side
 * with jsPDF (same visual language as generate-quote-pdf.ts).
 *
 * Anonymization holds on paper too: the vendor line reads "Conneverse
 * Fulfillment" — the shop orders from Conneverse; Conneverse routes to
 * the seller server-side.
 */

import jsPDF from "jspdf";
import type { PublicOrder } from "@/types/canonical";

const NAVY: [number, number, number] = [27, 40, 56];
const TEAL: [number, number, number] = [46, 196, 182];
const GRAY: [number, number, number] = [107, 114, 128];
const LIGHT_GRAY: [number, number, number] = [243, 244, 246];
const DARK: [number, number, number] = [26, 26, 46];

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

export function generatePurchaseOrderPDF(args: {
  order: PublicOrder;
  shop: { name: string; address: string; phone: string };
  /** 1-based index when a quote produced multiple supplier groups. */
  groupIndex?: number;
}): void {
  const { order, shop, groupIndex } = args;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 40;
  const marginR = 40;
  const contentW = pageW - marginL - marginR;
  let y = 40;

  // ─── Header ───
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEAL);
  doc.text("Conneverse", marginL, y + 12);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("Purchase Order", marginL, y + 26);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(
    `PO ${order.id}${groupIndex ? ` · group ${groupIndex}` : ""}`,
    pageW - marginR,
    y + 8,
    {
      align: "right",
    },
  );
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(
    `Date: ${new Date(order.createdAt).toLocaleDateString("en-US")}`,
    pageW - marginR,
    y + 22,
    { align: "right" },
  );
  doc.text(
    `ETA: ${new Date(order.etaDate).toLocaleDateString("en-US")}`,
    pageW - marginR,
    y + 34,
    { align: "right" },
  );

  y += 48;
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(1);
  doc.line(marginL, y, pageW - marginR, y);
  y += 18;

  // ─── Parties ───
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("VENDOR", marginL, y);
  doc.text("SHIP TO", marginL + contentW / 2, y);
  y += 12;
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Conneverse Fulfillment", marginL, y);
  doc.text(shop.name, marginL + contentW / 2, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.text("conneverse.ai · Fulfilled by Conneverse", marginL, y);
  doc.text(shop.address, marginL + contentW / 2, y);
  y += 12;
  doc.text(
    `Vehicle: ${order.vehicle.year} ${order.vehicle.make} ${order.vehicle.model}`,
    marginL,
    y,
  );
  doc.text(shop.phone, marginL + contentW / 2, y);
  y += 22;

  // ─── Lines table ───
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(marginL, y, contentW, 18, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  const colPart = marginL + 6;
  const colBrand = marginL + contentW * 0.45;
  const colQty = marginL + contentW * 0.66;
  const colUnit = marginL + contentW * 0.76;
  const colTotal = pageW - marginR - 6;
  doc.text("PART", colPart, y + 12);
  doc.text("BRAND", colBrand, y + 12);
  doc.text("QTY", colQty, y + 12);
  doc.text("UNIT", colUnit, y + 12);
  doc.text("TOTAL", colTotal, y + 12, { align: "right" });
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let subtotal = 0;
  for (const line of order.lines) {
    const lineTotal = line.unitPricePaid * line.qty;
    subtotal += lineTotal;
    doc.setTextColor(...DARK);
    const label =
      line.partName.length > 34
        ? line.partName.slice(0, 32) + "…"
        : line.partName;
    doc.text(label, colPart, y);
    doc.setTextColor(...GRAY);
    doc.setFontSize(8);
    doc.text(line.partNumber, colPart, y + 10);
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(line.brand, colBrand, y);
    doc.text(String(line.qty), colQty, y);
    doc.text(fmt(line.unitPricePaid), colUnit, y);
    doc.text(fmt(lineTotal), colTotal, y, { align: "right" });
    y += 24;
  }

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(marginL + contentW * 0.6, y, pageW - marginR, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text(`PO TOTAL: ${fmt(subtotal)}`, colTotal, y, { align: "right" });
  y += 28;

  // ─── Footer ───
  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(marginL, y, contentW, 32, 4, 4, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...GRAY);
  doc.text(
    "All parts Conneverse-guaranteed: fitment verified, 30-day returns, delivery SLA.",
    marginL + 8,
    y + 13,
  );
  doc.text(
    "Delivery routed by Conneverse. Questions: support@conneverse.ai",
    marginL + 8,
    y + 25,
  );

  doc.save(`po-${order.id}.pdf`);
}
