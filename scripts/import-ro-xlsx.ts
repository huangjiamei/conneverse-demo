import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../src/lib/prisma";
import { importRoFromXlsx } from "../src/lib/import-ro";

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error("Usage: npx tsx scripts/import-ro-xlsx.ts <xlsx path>");
    process.exit(1);
  }

  const absPath = path.resolve(xlsxPath);
  console.log(`Reading: ${absPath}`);
  const buffer = fs.readFileSync(absPath);

  const result = await importRoFromXlsx(prisma, buffer);

  console.log("\n=== Import summary ===");
  console.log(`  Shops inserted:     ${result.shops}`);
  console.log(`  ROs inserted:       ${result.ros}`);
  console.log(`  PartLines inserted: ${result.partLines}`);
  console.log(`  ROs existing skip:  ${result.existing}`);
  console.log(`  Services skipped:   ${result.servicesSkipped}`);
  console.log(`  Invalid skipped:    ${result.invalidSkipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });