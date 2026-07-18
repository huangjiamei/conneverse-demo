import type { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

// ============================================================
// 解析工具函数
// ============================================================

function parseVehicle(raw: string): {
  year: number | null;
  make: string;
  model: string;
} {
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

// ============================================================
// 常量
// ============================================================

// 排除服务性收费, 不进 matcher
// - Other: ADAS Calibration、Uber、Tow 等杂项费用
// - Sublet: 外包给第三方处理(诊断扫描、拆车件外购等)
const EXCLUDED_TYPES = new Set(["Other", "Sublet"]);

// ============================================================
// 返回类型
// ============================================================

export interface ImportRoResult {
  shops: number; // 新建的 Shop 数
  ros: number; // 新建的 RO 数
  partLines: number; // 新建的 PartLine 数
  existing: number; // 已存在(命中)的 RO 数, 走了 skip
  servicesSkipped: number; // Other / Sublet 类跳过数
  invalidSkipped: number; // 字段缺失/格式错误跳过数
}

// ============================================================
// 主入口: 从 xlsx buffer 导入到 DB
// ============================================================

export async function importRoFromXlsx(
  prisma: PrismaClient,
  buffer: Buffer,
): Promise<ImportRoResult> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    range: 7,
    defval: null,
    raw: true,
  });

  const result: ImportRoResult = {
    shops: 0,
    ros: 0,
    partLines: 0,
    existing: 0,
    servicesSkipped: 0,
    invalidSkipped: 0,
  };

  const shopIdCache = new Map<string, string>();
  const roIdCache = new Map<string, string>();

  for (const row of rows) {
    const get = (key: string): unknown => {
      const found = Object.keys(row).find((k) => k.trim() === key);
      return found ? row[found] : null;
    };

    const partType = toStringOrNull(get("Part Type")) ?? "";

    if (EXCLUDED_TYPES.has(partType)) {
      result.servicesSkipped++;
      continue;
    }

    const location = toStringOrNull(get("Location"));
    const roInfo = toStringOrNull(get("Repair Order Information"));
    const vehicleRaw = toStringOrNull(get("Vehicle"));
    const cccRoNumber = roInfo ? parseCccRoNumber(roInfo) : null;

    if (!location || !cccRoNumber || !vehicleRaw) {
      result.invalidSkipped++;
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
      result.shops++;
    }

    const roKey = `${shopId}:${cccRoNumber}`;
    let roId = roIdCache.get(roKey);
    if (!roId) {
      const existing = await prisma.repairOrder.findUnique({
        where: { shopId_cccRoNumber: { shopId, cccRoNumber } },
      });
      if (existing) {
        roId = existing.id;
        result.existing++;
      } else {
        const parsed = parseVehicle(vehicleRaw);
        if (parsed.year == null) {
          result.invalidSkipped++;
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
        result.ros++;
      }
      roIdCache.set(roKey, roId);
    }

    const lineNumber = get("Line");
    const cccLineNumber =
      typeof lineNumber === "number"
        ? lineNumber
        : parseInt(String(lineNumber ?? ""), 10);

    if (isNaN(cccLineNumber)) {
      result.invalidSkipped++;
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
    result.partLines++;
  }

  return result;
}
