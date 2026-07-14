import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SearchClient from "./SearchClient";

export default async function SearchPage({
  params,
}: {
  params: Promise<{ roId: string; partLineId: string }>;
}) {
  const { roId, partLineId } = await params;

  const partLine = await prisma.partLine.findUnique({
    where: { id: partLineId },
    include: {
      repairOrder: { include: { shop: true } },
      matchSearches: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          candidates: {
            orderBy: { rank: "asc" },
          },
        },
      },
    },
  });

  if (!partLine || partLine.repairOrderId !== roId) notFound();

  const ro = partLine.repairOrder;
  const latestSearch = partLine.matchSearches[0] ?? null;

  return (
    <main className="max-w-4xl mx-auto p-8">
      <Link
        href={`/ro/${roId}`}
        className="text-sm text-gray-500 hover:text-gray-700 transition inline-flex items-center gap-1"
      >
        ← Back to RO #{ro.cccRoNumber}
      </Link>

      <div className="mt-4 bg-[#1A1A2E] text-white rounded-xl p-6">
        <div className="text-xs text-white/50 tracking-wide">
          Searching for
        </div>
        <div className="mt-1 text-xl font-semibold">
          {ro.vehicleYear} {ro.vehicleMake} {ro.vehicleModel}
        </div>
      </div>

      <SearchClient
        partLineId={partLine.id}
        initialPartDescription={partLine.partDescription}
        initialPartNumber={partLine.partNumber}
        partType={partLine.partTypeRaw}
        cccLineNumber={partLine.cccLineNumber}
        latestSearch={
          latestSearch
            ? {
                id: latestSearch.id,
                createdAt: latestSearch.createdAt.toISOString(),
                label: latestSearch.matcherLabel,
                labelSource: latestSearch.labelSource,
                candidateCount: latestSearch.candidateCount,
                candidates: latestSearch.candidates.map((c) => ({
                  id: c.id,
                  rank: c.rank,
                  title: c.title,
                  price: String(c.price),
                  currency: c.currency,
                  itemUrl: c.itemUrl,
                  condition: c.condition,
                  candidateLabel: c.candidateLabel,
                  labelSource: c.labelSource,
                  ebayItemId: c.ebayItemId,
                })),
              }
            : null
        }
      />
    </main>
  );
}