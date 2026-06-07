/**
 * Smoke test for the eBay auth helper.
 *
 * Run from the project root:
 *   node --experimental-strip-types src/lib/test-ebay-auth.ts
 * Or with tsx if installed:
 *   npx tsx src/lib/test-ebay-auth.ts
 *
 * Loads .env.local via @next/env so EBAY_CLIENT_ID / EBAY_CLIENT_SECRET
 * are available without needing the Next dev server.
 */

// @next/env is CJS; import as default and destructure for Node ESM compat.
import nextEnv from "@next/env";
import { getEbayAccessToken } from "./ebay-auth.ts";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

async function main() {
  const token = await getEbayAccessToken();
  console.log(`${token.slice(0, 20)}...`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
