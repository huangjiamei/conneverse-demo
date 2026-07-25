/**
 * QuotePDF —— react-pdf 文档定义 (纯客户端, 在点击时动态 import + 渲染)。
 *
 * 单页 A4 报价单: header / vehicle / recommended / alternatives / cost breakdown / footer。
 * 数据由 QuoteBuilder 从 SourcingContext 组装后传入。不落库、不上传。
 */

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  formatWarranty,
  formatDeliveryRange,
  type Candidate,
} from "./CandidateCard";

const NAVY = "#1A1A2E";
const TEAL = "#00B4A6";
const GRAY = "#6B7280";
const LIGHT = "#9CA3AF";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export type QuotePDFProps = {
  vehicleLabel: string;
  partDescription: string;
  primary: Candidate;
  alternatives: Candidate[];
  quantities: Record<string, number>;
  laborHours: number;
  laborRate: number;
  taxRate: number;
  partsSubtotal: number;
  laborTotal: number;
  tax: number;
  grandTotal: number;
  quoteNumber: string;
  dateDisplay: string;
  generatedAt: string;
};

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: NAVY, fontFamily: "Helvetica" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { fontSize: 22, fontFamily: "Helvetica-Bold", color: NAVY },
  brandSub: { fontSize: 10, color: TEAL, marginTop: 2 },
  metaRight: { textAlign: "right" },
  metaLine: { fontSize: 9, color: GRAY, marginBottom: 2 },

  ruleNavy: { borderBottomWidth: 2, borderBottomColor: NAVY, marginTop: 12, marginBottom: 16 },
  ruleGray: { borderBottomWidth: 1, borderBottomColor: "#E5E7EB", marginTop: 20, marginBottom: 10 },

  sectionLabel: { fontSize: 8, color: GRAY, letterSpacing: 1, marginBottom: 4 },
  vehicleName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: NAVY },
  vehiclePart: { fontSize: 10, color: GRAY, marginTop: 3 },

  pill: {
    alignSelf: "flex-start",
    backgroundColor: TEAL,
    color: "#FFFFFF",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 8,
  },
  pillAlt: {
    alignSelf: "flex-start",
    backgroundColor: "#F3F4F6",
    color: GRAY,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 8,
  },

  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  cardPrimary: { borderColor: TEAL, backgroundColor: "#F0FDFA" },
  cardRow: { flexDirection: "row", justifyContent: "space-between" },
  brandText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: NAVY },
  titleText: { fontSize: 9, color: "#374151", marginTop: 2, maxWidth: 340 },
  metaText: { fontSize: 8, color: GRAY, marginTop: 4 },
  priceCol: { textAlign: "right" },
  price: { fontSize: 12, fontFamily: "Helvetica-Bold", color: NAVY },
  perEa: { fontSize: 8, color: LIGHT },
  diffCheaper: { fontSize: 8, color: "#059669", marginTop: 3, textAlign: "right" },
  diffDearer: { fontSize: 8, color: "#D97706", marginTop: 3, textAlign: "right" },

  breakdown: { marginTop: 4 },
  bdRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  bdLabel: { fontSize: 10, color: GRAY },
  bdValue: { fontSize: 10, color: NAVY },
  bdRule: { borderBottomWidth: 1, borderBottomColor: "#E5E7EB", marginVertical: 6 },
  grandLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: NAVY },
  grandValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY },

  footer: { position: "absolute", bottom: 30, left: 40, right: 40 },
  footerText: { fontSize: 8, color: LIGHT, textAlign: "center", marginTop: 2 },
});

function condWarrantyDelivery(c: Candidate): string {
  const parts: string[] = [];
  if (c.condition) parts.push(c.condition);
  const w = formatWarranty(c.enrichedFields?.warranty_raw);
  if (w) parts.push(`Warranty: ${w}`);
  const d = formatDeliveryRange(
    c.enrichedFields?.delivery_min_date,
    c.enrichedFields?.delivery_max_date
  );
  if (d) parts.push(`Delivery: ${d}`);
  return parts.join("  ·  ");
}

export function QuotePDF(props: QuotePDFProps) {
  const {
    vehicleLabel, partDescription, primary, alternatives, quantities,
    laborHours, laborRate, taxRate, partsSubtotal, laborTotal, tax, grandTotal,
    quoteNumber, dateDisplay, generatedAt,
  } = props;

  const primaryUnit = Number(primary.price);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>Conneverse</Text>
            <Text style={s.brandSub}>Trusted Parts Agent</Text>
          </View>
          <View style={s.metaRight}>
            <Text style={s.metaLine}>Quote #{quoteNumber}</Text>
            <Text style={s.metaLine}>Date: {dateDisplay}</Text>
          </View>
        </View>

        <View style={s.ruleNavy} />

        {/* Vehicle */}
        <View>
          <Text style={s.sectionLabel}>VEHICLE</Text>
          <Text style={s.vehicleName}>{vehicleLabel}</Text>
          <Text style={s.vehiclePart}>Part: {partDescription}</Text>
        </View>

        {/* Recommended */}
        <View style={{ marginTop: 18 }}>
          <Text style={s.pill}>RECOMMENDED</Text>
          <View style={[s.card, s.cardPrimary]}>
            <View style={s.cardRow}>
              <View>
                <Text style={s.brandText}>{primary.brand ?? "—"}</Text>
                <Text style={s.titleText}>{primary.title}</Text>
                <Text style={s.metaText}>{condWarrantyDelivery(primary)}</Text>
              </View>
              <View style={s.priceCol}>
                <Text style={s.price}>{usd(primaryUnit)}</Text>
                <Text style={s.perEa}>
                  /ea  ×  {quantities[primary.id] ?? 1}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={s.pillAlt}>ALTERNATIVES ({alternatives.length})</Text>
            {alternatives.map((c) => {
              const unit = Number(c.price);
              const diff = unit - primaryUnit;
              return (
                <View key={c.id} style={s.card}>
                  <View style={s.cardRow}>
                    <View>
                      <Text style={s.brandText}>{c.brand ?? "—"}</Text>
                      <Text style={s.titleText}>{c.title}</Text>
                      <Text style={s.metaText}>{condWarrantyDelivery(c)}</Text>
                    </View>
                    <View style={s.priceCol}>
                      <Text style={s.price}>{usd(unit)}</Text>
                      <Text style={s.perEa}>/ea</Text>
                      {diff !== 0 && (
                        <Text style={diff < 0 ? s.diffCheaper : s.diffDearer}>
                          {diff < 0 ? "-" : "+"}
                          {usd(Math.abs(diff))} vs recommended
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Cost breakdown */}
        <View style={{ marginTop: 18 }}>
          <Text style={s.sectionLabel}>COST BREAKDOWN</Text>
          <View style={s.breakdown}>
            <View style={s.bdRow}>
              <Text style={s.bdLabel}>Parts subtotal (recommended)</Text>
              <Text style={s.bdValue}>{usd(partsSubtotal)}</Text>
            </View>
            <View style={s.bdRow}>
              <Text style={s.bdLabel}>
                Labor: {laborHours}h × {usd(laborRate)}/hr
              </Text>
              <Text style={s.bdValue}>{usd(laborTotal)}</Text>
            </View>
            <View style={s.bdRow}>
              <Text style={s.bdLabel}>Tax ({taxRate}%)</Text>
              <Text style={s.bdValue}>{usd(tax)}</Text>
            </View>
            <View style={s.bdRule} />
            <View style={s.bdRow}>
              <Text style={s.grandLabel}>Grand Total</Text>
              <Text style={s.grandValue}>{usd(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.ruleGray} />
          <Text style={s.footerText}>Prepared by Conneverse</Text>
          <Text style={s.footerText}>Generated {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}
