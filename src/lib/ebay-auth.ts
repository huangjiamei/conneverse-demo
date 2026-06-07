/**
 * eBay OAuth2 client-credentials helper.
 *
 * Server-only. Reads EBAY_CLIENT_ID / EBAY_CLIENT_SECRET from the environment
 * and exchanges them for an application access token via the Identity API.
 * The token is cached in-process and reused until shortly before expiry.
 */

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SCOPE = "https://api.ebay.com/oauth/api_scope";

// Refresh a minute before eBay says the token expires, so requests in
// flight at the boundary don't get rejected.
const EXPIRY_BUFFER_MS = 60_000;

type CachedToken = {
  accessToken: string;
  expiresAt: number; // epoch ms
};

type TokenResponse = {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
};

// Module-level cache. Persists for the lifetime of the Node process /
// serverless invocation. Concurrent callers share the in-flight request.
let cache: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;

async function fetchToken(): Promise<CachedToken> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing eBay credentials: set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local"
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: SCOPE,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `eBay token request failed (${res.status} ${res.statusText}): ${errBody}`
    );
  }

  const data = (await res.json()) as TokenResponse;

  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new Error(
      `Malformed eBay token response: ${JSON.stringify(data)}`
    );
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Returns a valid eBay application access token. Cached in memory; only
 * hits the eBay endpoint when there is no cached token or the cached
 * token is within the refresh buffer of expiring.
 */
export async function getEbayAccessToken(): Promise<string> {
  if (cache && cache.expiresAt - Date.now() > EXPIRY_BUFFER_MS) {
    return cache.accessToken;
  }

  if (!inflight) {
    inflight = (async () => {
      try {
        const next = await fetchToken();
        cache = next;
        return next;
      } finally {
        inflight = null;
      }
    })();
  }

  const fresh = await inflight;
  return fresh.accessToken;
}

/**
 * Test helper: clears the in-memory token cache. Not used in normal
 * operation, but handy for forcing a refresh in tests.
 */
export function _clearEbayTokenCache(): void {
  cache = null;
  inflight = null;
}
