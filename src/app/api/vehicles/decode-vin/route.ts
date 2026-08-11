/**
 * GET /api/vehicles/decode-vin?vin=1HGCM82633A004352[&year=2003]
 *
 * VIN → NHTSA vPIC 解码 → 归一化匹配 VCdb → BaseVehicleID。
 * year 可选: 已知年份时带上能提高 vPIC 的准确度 (VIN 第 10 位年份码 30 年一轮回)。
 *
 * 返回 200 (三种 status, 都不是错误 —— 对不上是正常剧情, 前端回退手动选择器):
 *   { vin, cached, decoded: { modelYear, make, model, series, trim, bodyClass, clean },
 *     status: "resolved",  confidence, vehicle: { year, makeId, makeName, modelId,
 *                                                 modelName, baseVehicleId } }
 *   { vin, cached, decoded, status: "ambiguous", reason, prefill: { year, makeId, makeName },
 *     candidates: [{ id, name }] }      // 收窄后的车型候选, 可能为空
 *   { vin, cached, decoded, status: "unmatched", reason, prefill: { year, makeId, makeName } }
 *
 * 错误: 400 VIN 不合法 / 429 限流 / 502 vPIC 不可达。
 *
 * 注意 sub-model / trim / engine 一律不从 VIN 锁定 —— vPIC 这几层经常不全,
 * 且和 VCdb 的 SubModel 命名对不上, 更细的层级留给用户在候选里选。
 */

import { NextResponse } from "next/server";
import { normalizeVin, vinError } from "@/lib/vehicle/vin";
import { decodeVin, isCleanDecode, VpicError } from "@/lib/vehicle/vpic";
import { resolveToBaseVehicle } from "@/lib/vehicle/vcdb-resolve";
import { rateLimit, clientIp } from "@/lib/auth/rateLimit";

// 打的是外部免费服务, 给个上限防止被当白嫖代理 (缓存命中的也计数, 无所谓)
const LIMIT = 30;
const WINDOW_MS = 60_000;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const vin = normalizeVin(sp.get("vin") ?? "");

  const invalid = vinError(vin);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  // year 可选; 给了就必须像个年份, 否则忽略比报错更友好? —— 不, 静默忽略会
  // 让人以为已经用上了, 直接拒。
  const yearRaw = sp.get("year");
  let year: number | undefined;
  if (yearRaw != null && yearRaw !== "") {
    const y = Number(yearRaw);
    if (!Number.isInteger(y) || y < 1900 || y > 2100) {
      return NextResponse.json({ error: "Optional ?year= must be a 4-digit year" }, { status: 400 });
    }
    year = y;
  }

  const gate = rateLimit(`vin:${clientIp(req)}`, LIMIT, WINDOW_MS);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Too many VIN lookups. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } }
    );
  }

  let decode, cached;
  try {
    ({ decode, cached } = await decodeVin(vin, year));
  } catch (e) {
    if (e instanceof VpicError) {
      return NextResponse.json(
        { error: "VIN decoding is unavailable right now.", detail: e.message },
        { status: 502 }
      );
    }
    throw e;
  }

  const decoded = {
    modelYear: decode.modelYear,
    make: decode.make,
    model: decode.model,
    series: decode.series,
    trim: decode.trim,
    bodyClass: decode.bodyClass,
    clean: isCleanDecode(decode),
    errorText: isCleanDecode(decode) ? null : decode.errorText,
  };

  // vPIC 连 make 都没给出来 = 这个 VIN 它不认识, 没必要再查 VCdb
  if (!decode.make && !decode.model) {
    return NextResponse.json({
      vin,
      cached,
      decoded,
      status: "unmatched" as const,
      reason: "vpic_no_vehicle",
      prefill: { year: null, makeId: null, makeName: null },
    });
  }

  // 年份优先用调用方给的 (用户手选过就以用户为准), 否则用 vPIC 解出来的
  const resolution = await resolveToBaseVehicle({
    year: year ?? decode.modelYear,
    make: decode.make,
    model: decode.model,
    series: decode.series,
    trim: decode.trim,
  });

  if (resolution.status === "resolved") {
    return NextResponse.json({
      vin,
      cached,
      decoded,
      status: "resolved" as const,
      confidence: resolution.confidence,
      vehicle: {
        year: resolution.year,
        makeId: resolution.makeId,
        makeName: resolution.makeName,
        modelId: resolution.modelId,
        modelName: resolution.modelName,
        baseVehicleId: resolution.baseVehicleId,
      },
    });
  }

  if (resolution.status === "ambiguous") {
    return NextResponse.json({
      vin,
      cached,
      decoded,
      status: "ambiguous" as const,
      reason: resolution.reason,
      prefill: {
        year: resolution.year,
        makeId: resolution.makeId,
        makeName: resolution.makeName,
      },
      candidates: resolution.candidates,
    });
  }

  return NextResponse.json({
    vin,
    cached,
    decoded,
    status: "unmatched" as const,
    reason: resolution.reason,
    prefill: {
      year: resolution.year,
      makeId: resolution.makeId,
      makeName: resolution.makeName,
    },
  });
}
