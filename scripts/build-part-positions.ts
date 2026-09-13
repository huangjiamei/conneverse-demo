/**
 * 预算 PartTerminologyID → [方向性位置] 映射表, 写到 src/data/part-positions.json。
 *
 * PCdb 是静态参考数据 → 构建时算好, 运行时前端查这张表零 DB (见 /api/parts/positions)。
 * 只收**有方向性位置**的件型 (剥掉 "N/A"); 只有 N/A / 无位置的件型不进表 → 前端不弹选择器。
 *
 * 跑法 (node v24): node --import tsx scripts/build-part-positions.ts   (或 tsx scripts/...)
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const OUT = new URL("../src/data/part-positions.json", import.meta.url);

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const positions = await prisma.pcdbPosition.findMany({ select: { id: true, position: true } });
    const posById = new Map(positions.map((p) => [p.id, p.position]));
    const links = await prisma.pcdbPartPosition.findMany({ select: { partTerminologyId: true, positionId: true } });

    // partId → Set(position names)，剥掉 "N/A"
    const byPart = new Map<number, Set<string>>();
    for (const l of links) {
      const name = posById.get(l.positionId);
      if (!name || name.trim().toUpperCase() === "N/A") continue;
      if (!byPart.has(l.partTerminologyId)) byPart.set(l.partTerminologyId, new Set());
      byPart.get(l.partTerminologyId)!.add(name);
    }

    // 只留有方向性位置的件型; 位置按名字排序, 输出稳定
    const map: Record<string, string[]> = {};
    for (const [pid, set] of byPart) {
      if (set.size === 0) continue;
      map[pid] = [...set].sort((a, b) => a.localeCompare(b));
    }

    writeFileSync(OUT, JSON.stringify(map) + "\n");
    console.log(`wrote ${Object.keys(map).length} part types with directional positions → ${OUT.pathname}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
