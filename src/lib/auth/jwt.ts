/**
 * Session JWT —— 签发 / 校验。
 *
 * 只依赖 jose,不碰 prisma / next/headers,所以 proxy.ts 和 API route 都能 import。
 * HS256 + AUTH_SECRET。cookie 本身的读写在 session.ts (那边要 next/headers)。
 */

import { SignJWT, jwtVerify } from "jose";
import type { AccountStatus, Role, Session } from "./types";

export const SESSION_COOKIE = "conneverse_session";
/** 8 小时,单位秒 —— cookie maxAge 和 JWT exp 用同一个值 */
export const SESSION_MAX_AGE = 60 * 60 * 8;

const ALG = "HS256";

let cachedKey: Uint8Array | null = null;

function secretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (need ≥32 chars). Add it to .env — " +
        'generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"'
    );
  }
  cachedKey = new TextEncoder().encode(raw);
  return cachedKey;
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: ALG })
    .setSubject(session.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

/** 签名/过期/形状任一不合法都返回 null —— 调用方一律当作未登录 */
export async function verifySessionToken(
  token: string | undefined
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALG],
    });
    return toSession(payload);
  } catch {
    return null;
  }
}

const ROLES: Role[] = ["PLATFORM_ADMIN", "SHOP_ADMIN", "EMPLOYEE"];
const STATUSES: AccountStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "DISABLED",
];

// JWT 解出来的是 unknown,逐字段收窄; 任何一项不对就整体作废
function toSession(p: Record<string, unknown>): Session | null {
  const { id, kind, role, shopId, status, name, email } = p;
  if (typeof id !== "string" || typeof email !== "string") return null;
  if (kind !== "admin" && kind !== "user") return null;
  if (typeof role !== "string" || !ROLES.includes(role as Role)) return null;
  if (typeof status !== "string" || !STATUSES.includes(status as AccountStatus))
    return null;
  if (shopId !== null && typeof shopId !== "string") return null;
  if (name !== null && typeof name !== "string") return null;
  return {
    id,
    kind,
    role: role as Role,
    shopId,
    status: status as AccountStatus,
    name,
    email,
  };
}
