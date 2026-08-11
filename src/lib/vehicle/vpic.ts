/**
 * NHTSA vPIC VIN 解码客户端 (免费, 不需要 key)。
 *
 * 只取到 year + make + model 这一层就停。vPIC 是美国市场数据, year/make/model
 * 很准, 但 Series/Trim 经常空或和 VCdb 的 SubModel 叫法对不上 —— 拿它去锁
 * sub-model 只会造出「自信的错车」, 所以更细的层级留给用户在 VCdb 候选里选。
 * Series/Trim/BodyClass 仍然带回去, 但只当提示文案用, 不参与匹配。
 *
 * 缓存: 进程内 Map, 同一个 VIN 第二次解码不再打 vPIC。单进程/重启即清,
 * 和 src/lib/auth/rateLimit.ts 一个路子 —— 要多实例共享换 Redis 即可。
 */

const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // VIN → 车型是静态事实, 一天足够
const CACHE_MAX = 1000;

export type VpicDecode = {
  modelYear: number | null;
  make: string | null;
  model: string | null;
  /** 以下只用于提示文案, 不参与 VCdb 匹配 */
  series: string | null;
  trim: string | null;
  bodyClass: string | null;
  /** vPIC 自己的错误码, "0" = 干净解码; 多个码用逗号分隔 */
  errorCode: string;
  errorText: string;
};

export type VpicResult = { decode: VpicDecode; cached: boolean };

/** vPIC 不可达 / 返回非预期结构 —— 路由层转 502 */
export class VpicError extends Error {}

type Entry = { decode: VpicDecode; expiresAt: number };
const cache = new Map<string, Entry>();

function cacheKey(vin: string, modelYear?: number): string {
  return modelYear ? `${vin}|${modelYear}` : vin;
}

/** 顺带清过期项, 满了就丢最旧的 (Map 保插入序) */
function evict(now: number) {
  for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
  while (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** 空串和 vPIC 的占位符都当没有 */
function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t === "Not Applicable" || t === "Not Available") return null;
  return t;
}

/**
 * @param vin 必须已经过 normalizeVin + 校验
 * @param modelYear 已知年份时传, vPIC 用它消歧第 10 位 (VIN 年份码 30 年一轮回)
 * @throws VpicError
 */
export async function decodeVin(vin: string, modelYear?: number): Promise<VpicResult> {
  const key = cacheKey(vin, modelYear);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return { decode: hit.decode, cached: true };

  const url =
    `${VPIC_BASE}/${encodeURIComponent(vin)}?format=json` +
    (modelYear ? `&modelyear=${modelYear}` : "");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new VpicError(
      e instanceof Error && e.name === "TimeoutError"
        ? `vPIC did not respond within ${TIMEOUT_MS / 1000}s`
        : `Could not reach vPIC: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!res.ok) throw new VpicError(`vPIC returned HTTP ${res.status}`);

  let body: { Results?: unknown };
  try {
    body = await res.json();
  } catch {
    throw new VpicError("vPIC returned a non-JSON body");
  }

  const row = Array.isArray(body.Results) ? body.Results[0] : null;
  if (!row || typeof row !== "object") {
    throw new VpicError("vPIC returned no decode row");
  }
  const r = row as Record<string, unknown>;

  const yearRaw = clean(r.ModelYear);
  const parsedYear = yearRaw ? Number.parseInt(yearRaw, 10) : NaN;

  const decode: VpicDecode = {
    modelYear: Number.isInteger(parsedYear) ? parsedYear : null,
    make: clean(r.Make),
    model: clean(r.Model),
    series: clean(r.Series),
    trim: clean(r.Trim),
    bodyClass: clean(r.BodyClass),
    errorCode: clean(r.ErrorCode) ?? "",
    errorText: clean(r.ErrorText) ?? "",
  };

  evict(now);
  cache.set(key, { decode, expiresAt: now + CACHE_TTL_MS });
  return { decode, cached: false };
}

/**
 * vPIC 的 ErrorCode 是逗号分隔的码表, "0" = 干净。
 * 注意: 带错误码也常常照样给出正确的 year/make/model (比如码 6 "incomplete VIN"),
 * 所以调用方按字段有没有值来判断, 这个只用来决定要不要给用户加一句提醒。
 */
export function isCleanDecode(d: VpicDecode): boolean {
  const codes = d.errorCode.split(",").map((c) => c.trim());
  return codes.every((c) => c === "0" || c === "");
}
