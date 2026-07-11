/**
 * Consensus OE resolver test — 10 common (vehicle, part) cases.
 * Run: node --experimental-strip-types src/lib/test-oe-consensus.ts
 *
 * Acceptance: each returns a plausible consensus OE number; common
 * parts reach cross-seller agreement.
 */

import nextEnv from "@next/env";
import { resolveConsensusOE } from "./oe-resolver.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const CASES: Array<{
  vehicle: { year: number; make: string; model: string };
  partType: string;
  position: string | null;
}> = [
  { vehicle: { year: 2014, make: "Subaru", model: "Forester" }, partType: "brake rotor", position: "front" },
  { vehicle: { year: 2022, make: "Toyota", model: "Camry" }, partType: "brake pads", position: "front" },
  { vehicle: { year: 2020, make: "Honda", model: "Civic" }, partType: "oil filter", position: null },
  { vehicle: { year: 2019, make: "Ford", model: "F-150" }, partType: "spark plug", position: null },
  { vehicle: { year: 2021, make: "Toyota", model: "RAV4" }, partType: "air filter", position: null },
  { vehicle: { year: 2018, make: "Honda", model: "Accord" }, partType: "cabin air filter", position: null },
  { vehicle: { year: 2020, make: "Chevrolet", model: "Silverado" }, partType: "brake pads", position: "front" },
  { vehicle: { year: 2019, make: "Nissan", model: "Altima" }, partType: "alternator", position: null },
  { vehicle: { year: 2022, make: "Hyundai", model: "Elantra" }, partType: "brake rotor", position: "rear" },
  { vehicle: { year: 2021, make: "Subaru", model: "Outback" }, partType: "wheel hub", position: "rear" },
];

let withConsensus = 0;
for (const c of CASES) {
  const label = `${c.vehicle.year} ${c.vehicle.make} ${c.vehicle.model} ${c.position ?? ""} ${c.partType}`.replace(/\s+/g, " ").trim();
  try {
    const results = await resolveConsensusOE({
      vehicle: c.vehicle,
      partType: c.partType,
      position: c.position,
      query: c.partType,
    });
    const top = results[0];
    if (top && top.sellerCount >= 2) withConsensus++;
    const summary = results
      .slice(0, 3)
      .map((r) => `${r.oeNumber}(${r.sellerCount}s,${(r.confidence * 100) | 0}%)`)
      .join("  ");
    console.log(`${label.padEnd(44)} → ${summary || "(none)"}`);
  } catch (e) {
    console.log(`${label.padEnd(44)} → ERROR ${(e as Error).message}`);
  }
}
console.log(`\n${withConsensus}/${CASES.length} reached cross-seller consensus (≥2 sellers on top OE)`);
