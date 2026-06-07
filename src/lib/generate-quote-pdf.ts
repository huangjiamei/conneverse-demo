import jsPDF from "jspdf";

type QuoteItem = {
  partName: string;
  partNumber: string;
  brand: string;
  qty: number;
  unitPrice: number;
  warranty: string;
};

type QuoteOption = {
  label: string;
  deliveryLabel: string;
  items: QuoteItem[];
  partsSubtotal: number;
  savings?: number;
};

type QuoteData = {
  optionA?: QuoteOption;
  optionB?: QuoteOption;
  laborHours: number;
  vehicle: { year: number; make: string; model: string };
  customerName?: string;
  shopConfig: {
    name: string;
    address: string;
    phone: string;
    laborRate: number;
    taxRate: number;
  };
};

// Colors
const NAVY: [number, number, number] = [27, 40, 56];
const TEAL: [number, number, number] = [46, 196, 182];
const AMBER: [number, number, number] = [240, 165, 0];
const GREEN: [number, number, number] = [34, 197, 94];
const GRAY: [number, number, number] = [107, 114, 128];
const LIGHT_GRAY: [number, number, number] = [243, 244, 246];
const DARK: [number, number, number] = [26, 26, 46];
const WHITE: [number, number, number] = [255, 255, 255];

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

export function generateQuotePDF(data: QuoteData): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 40;
  const marginR = 40;
  const contentW = pageW - marginL - marginR;
  let y = 36;

  const quoteNum = `QT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
  const today = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 7);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  // ─── HEADER ───
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEAL);
  doc.text("Conneverse", marginL, y + 16);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("Trusted Parts Agent", marginL, y + 28);

  // Shop info right-aligned
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(data.shopConfig.name, pageW - marginR, y + 8, { align: "right" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(data.shopConfig.address, pageW - marginR, y + 20, {
    align: "right",
  });
  doc.text(data.shopConfig.phone, pageW - marginR, y + 32, {
    align: "right",
  });

  y += 42;

  // Teal rule
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(1);
  doc.line(marginL, y, pageW - marginR, y);
  y += 16;

  // ─── QUOTE META ───
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("PARTS QUOTE", marginL, y + 14);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`Quote #: ${quoteNum}`, marginL, y + 28);
  doc.text(
    `Date: ${fmtDate(today)}    Valid until: ${fmtDate(validUntil)}`,
    marginL,
    y + 40
  );

  // Right side
  doc.text(
    `Customer: ${data.customerName || "\u2014"}`,
    pageW - marginR,
    y + 14,
    { align: "right" }
  );
  doc.text(
    `Vehicle: ${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`,
    pageW - marginR,
    y + 28,
    { align: "right" }
  );

  y += 52;

  // ─── GUARANTEE STRIP ───
  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(marginL, y, contentW, 40, 4, 4, "F");

  const badges = [
    "\u2713 Fitment Verified",
    "\uD83D\uDD12 Price Locked 48h",
    "\u23F1 Delivery Guaranteed",
    "\u21A9 30-Day Returns",
  ];
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  const badgeW = contentW / 4;
  badges.forEach((b, i) => {
    doc.text(b, marginL + badgeW * i + badgeW / 2, y + 16, {
      align: "center",
    });
  });

  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...GRAY);
  doc.text(
    "All Conneverse guarantees apply equally to both options.",
    marginL + contentW / 2,
    y + 32,
    { align: "center" }
  );

  y += 50;

  // ─── DUAL OPTION SECTION ───
  const hasBoth = data.optionA && data.optionB;
  const gap = 12;
  const boxW = hasBoth ? (contentW - gap) / 2 : contentW;

  function drawOptionBox(
    opt: QuoteOption,
    x: number,
    startY: number,
    w: number,
    color: [number, number, number],
    icon: string,
    savingsAmt?: number
  ): number {
    let cy = startY;

    // Header bar
    doc.setFillColor(...color);
    doc.roundedRect(x, cy, w, 24, 3, 3, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(`${icon} ${opt.label}`, x + 8, cy + 16);

    if (savingsAmt && savingsAmt > 0) {
      doc.setFillColor(...GREEN);
      const saveTxt = `Save ${fmt(savingsAmt)}`;
      const saveW = doc.getTextWidth(saveTxt) + 12;
      doc.roundedRect(x + w - saveW - 6, cy + 4, saveW, 16, 3, 3, "F");
      doc.setTextColor(...WHITE);
      doc.setFontSize(9);
      doc.text(saveTxt, x + w - saveW / 2 - 6, cy + 15, { align: "center" });
    }

    cy += 30;

    // Delivery line
    doc.setFontSize(11);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...DARK);
    doc.text(opt.deliveryLabel, x + 6, cy + 8);
    cy += 18;

    // Mini-table header
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(x, cy, w, 14, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GRAY);
    const colPart = x + 4;
    const colBrand = x + w * 0.5;
    const colQty = x + w * 0.72;
    const colPrice = x + w * 0.85;
    doc.text("PART NAME", colPart, cy + 10);
    doc.text("BRAND", colBrand, cy + 10);
    doc.text("QTY", colQty, cy + 10);
    doc.text("PRICE", colPrice, cy + 10);
    cy += 16;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    opt.items.forEach((item, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 252);
        doc.rect(x, cy - 2, w, 14, "F");
      }
      doc.setTextColor(...DARK);
      const partLabel =
        item.partName.length > 24
          ? item.partName.slice(0, 22) + "..."
          : item.partName;
      doc.text(partLabel, colPart, cy + 8);
      doc.text(item.brand, colBrand, cy + 8);
      doc.text(String(item.qty), colQty, cy + 8);
      doc.text(fmt(item.unitPrice * item.qty), colPrice, cy + 8);
      cy += 14;
    });

    cy += 4;

    // Subtotals
    const laborCost = data.laborHours * data.shopConfig.laborRate;
    const taxable = opt.partsSubtotal + laborCost;
    const taxAmt = taxable * data.shopConfig.taxRate;
    const total = taxable + taxAmt;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    const rightX = x + w - 6;

    doc.text(`Parts total: ${fmt(opt.partsSubtotal)}`, rightX, cy + 8, {
      align: "right",
    });
    cy += 12;
    doc.text(
      `Labor (${data.laborHours}h \u00D7 $${data.shopConfig.laborRate}/hr): ${fmt(laborCost)}`,
      rightX,
      cy + 8,
      { align: "right" }
    );
    cy += 12;
    doc.text(
      `Tax (${(data.shopConfig.taxRate * 100).toFixed(2)}%): ${fmt(taxAmt)}`,
      rightX,
      cy + 8,
      { align: "right" }
    );
    cy += 14;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(x + w * 0.5, cy, rightX, cy);
    cy += 4;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(`TOTAL: ${fmt(total)}`, rightX, cy + 10, { align: "right" });
    cy += 18;

    // Checkbox
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.rect(x + 6, cy, 10, 10);
    doc.text("I'd like this option", x + 20, cy + 9);
    cy += 16;

    // Draw border around entire box
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, startY, w, cy - startY, 4, 4, "S");

    return cy;
  }

  let endY = y;

  if (data.optionA) {
    const boxX = marginL;
    endY = drawOptionBox(
      data.optionA,
      boxX,
      y,
      boxW,
      TEAL,
      "\u23F1",
      undefined
    );
  }

  if (data.optionB) {
    const boxX = hasBoth ? marginL + boxW + gap : marginL;
    const endY2 = drawOptionBox(
      data.optionB,
      boxX,
      y,
      boxW,
      AMBER,
      "\uD83D\uDCC5",
      data.optionB.savings
    );
    endY = Math.max(endY, endY2);
  }

  // OR separator
  if (hasBoth) {
    const midX = marginL + boxW + gap / 2;
    const midY = y + (endY - y) / 2;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GRAY);
    doc.text("OR", midX, midY, { align: "center" });
  }

  y = endY + 8;

  if (hasBoth) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GRAY);
    doc.text(
      "Both options are quality-verified. Please check your preferred option and return this quote to the shop.",
      marginL + contentW / 2,
      y + 8,
      { align: "center" }
    );
    y += 20;
  }

  // ─── PRICING FOOTNOTE ───
  y += 4;
  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(marginL, y, contentW, 36, 4, 4, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...GRAY);
  doc.text(
    `Prices are locked for 48 hours from quote date. Conneverse guarantees fitment for ${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}.`,
    marginL + 8,
    y + 14
  );
  doc.text(
    "30-day returns on all parts. If delivery is late, Conneverse absorbs the cost.",
    marginL + 8,
    y + 26
  );

  y += 44;

  // ─── FOOTER ───
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(1);
  doc.line(marginL, y, pageW - marginR, y);
  y += 12;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(
    "Powered by Conneverse \u2014 AI-Powered Parts Procurement  \u00B7  conneverse.ai",
    marginL,
    y + 6
  );
  doc.text(
    `Quote valid 7 days \u00B7 ${quoteNum}`,
    pageW - marginR,
    y + 6,
    { align: "right" }
  );

  // Save
  const filename = `quote-${data.vehicle.make.toLowerCase()}-${data.vehicle.model.toLowerCase().replace(/\s+/g, "-")}-${today.toISOString().slice(0, 10).replace(/-/g, "")}.pdf`;
  doc.save(filename);
}
