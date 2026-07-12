import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as XLSX from "xlsx";
import * as path from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function parseVehicle(raw: string): { year: number | null; make: string; model: string } {
  const trimmed = (raw || "").trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) return { year: null, make: "", model: "" };
  const yearNum = parseInt(parts[0], 10);
  const year = /^(19|20)\d{2}$/.test(parts[0]) ? yearNum : null;
  const make = parts[1]; 
  const model = parts.slice(2).join(" ");
  return { year, make, model };
}

function parseCccRoNumber(roInfo: string): string | null {
  const trimmed = (roInfo || "").trim();
  const match = trimmed.match(/^(\d+)/);
  return match?.[1] ?? null;
}

function excelDateToJs(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const utcDays = value - 25569;
    return new Date(utcDays * 86400 * 1000);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toDecimalOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return isNaN(n) ? null : n.toFixed(4);
}

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error("Usage: npx tsx scripts/import-ro-xlsx.ts <xlsx path>");
    process.exit(1);
  }

  const absPath = path.resolve(xlsxPath);
  console.log(`Reading: ${absPath}`);
  const wb = XLSX.readFile(absPath);
  const ws = wb.Sheets[wb.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    range: 7,
    defval: null,
    raw: true,
  });

  console.log(`Total rows: ${rows.length}`);

  let insertedShops = 0;
  let insertedROs = 0;
  let insertedPartLines = 0;
  let skippedNonPart = 0;
  let skippedInvalid = 0;
  let skippedExisting = 0;

  const shopIdCache = new Map<string, string>();
  const roIdCache = new Map<string, string>();

  for (const row of rows) {
    const get = (key: string): unknown => {
      const found = Object.keys(row).find((k) => k.trim() === key);
      return found ? row[found] : null;
    };

    const partType = toStringOrNull(get("Part Type")) ?? "";

// 排除服务性收费,不进 matcher
// - Other: ADAS Calibration、Uber、Tow 等杂项费用
// - Sublet: 外包给第三方处理(诊断扫描、拆车件外购等)
const EXCLUDED_TYPES = new Set(["Other", "Sublet"]);
if (EXCLUDED_TYPES.has(partType)) {
  skippedNonPart++;
  continue;
}

    const location = toStringOrNull(get("Location"));
    const roInfo = toStringOrNull(get("Repair Order Information"));
    const vehicleRaw = toStringOrNull(get("Vehicle"));
    const cccRoNumber = roInfo ? parseCccRoNumber(roInfo) : null;

    if (!location || !cccRoNumber || !vehicleRaw) {
      skippedInvalid++;
      continue;
    }

    let shopId = shopIdCache.get(location);
    if (!shopId) {
      const shop = await prisma.shop.upsert({
        where: { name: location },
        create: { name: location },
        update: {},
      });
      shopId = shop.id;
      shopIdCache.set(location, shopId);
      insertedShops++;
    }

    const roKey = `${shopId}:${cccRoNumber}`;
    let roId = roIdCache.get(roKey);
    if (!roId) {
      const existing = await prisma.repairOrder.findUnique({
        where: { shopId_cccRoNumber: { shopId, cccRoNumber } },
      });
      if (existing) {
        roId = existing.id;
        skippedExisting++;
      } else {
        const parsed = parseVehicle(vehicleRaw);
        if (parsed.year == null) {
          console.warn(`Skipping row, cannot parse year: ${vehicleRaw}`);
          skippedInvalid++;
          continue;
        }
        const ro = await prisma.repairOrder.create({
          data: {
            shopId,
            cccRoNumber,
            vehicleYear: parsed.year,
            vehicleMake: parsed.make,
            vehicleModel: parsed.model,
            vehicleRaw,
          },
        });
        roId = ro.id;
        insertedROs++;
      }
      roIdCache.set(roKey, roId);
    }

    const lineNumber = get("Line");
    const cccLineNumber =
      typeof lineNumber === "number"
        ? lineNumber
        : parseInt(String(lineNumber ?? ""), 10);

    if (isNaN(cccLineNumber)) {
      skippedInvalid++;
      continue;
    }

    const partDescription = toStringOrNull(get("Part Description")) ?? "";
    const partNumber = toStringOrNull(get("Part Number"));
    const quantityRaw = get("RO Qty");
    const quantity =
      typeof quantityRaw === "number"
        ? quantityRaw
        : parseInt(String(quantityRaw ?? "1"), 10) || 1;

    const existingPartLine = await prisma.partLine.findUnique({
      where: {
        repairOrderId_cccLineNumber: { repairOrderId: roId, cccLineNumber },
      },
    });
    if (existingPartLine) continue;

    await prisma.partLine.create({
      data: {
        repairOrderId: roId,
        cccLineNumber,
        partTypeRaw: partType,
        partDescriptionRaw: partDescription,
        partNumberRaw: partNumber,
        partDescription,
        partNumber,
        quantity,
        historicalPurchase: {
          create: {
            vendorName: toStringOrNull(get("Vendor Name")),
            discountPercent: toDecimalOrNull(get("Discount %")),
            orderedDate: excelDateToJs(get("Ordered Date")),
            expectedDelivery: excelDateToJs(get("Expected Delivery")),
            invoiceDate: excelDateToJs(get("Invoice Date")),
            creditDate: excelDateToJs(get("Credit Date")),
            extendedSales: toDecimalOrNull(get("Extended Sales $")),
            actualCost: toDecimalOrNull(get("Actual Cost $")),
            remarks: toStringOrNull(get("Remarks")),
          },
        },
      },
    });
    insertedPartLines++;
  }

  console.log("\n=== Import summary ===");
  console.log(`  Shops inserted:     ${insertedShops}`);
  console.log(`  ROs inserted:       ${insertedROs}`);
  console.log(`  PartLines inserted: ${insertedPartLines}`);
  console.log(`  ROs existing skip:  ${skippedExisting}`);
  console.log(`  Services skipped:   ${skippedNonPart}`);
  console.log(`  Invalid skipped:    ${skippedInvalid}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });