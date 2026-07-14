import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DeletePartLineButton from "./DeletePartLineButton";

export default async function RoDetailPage({
  params,
}: {
  params: Promise<{ roId: string }>;
}) {
  const { roId } = await params;

  const ro = await prisma.repairOrder.findUnique({
    where: { id: roId },
    include: {
      shop: true,
      partLines: {
        orderBy: { cccLineNumber: "asc" },
        include: {
          historicalPurchase: true,
          matchSearches: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          purchaseOrders: {
            take: 1,
          },
        },
      },
    },
  });

  if (!ro) notFound();

  return (
    <main className="max-w-4xl mx-auto p-8">
      {/* 面包屑返回 */}
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-700 transition inline-flex items-center gap-1"
      >
        ← All repair orders
      </Link>

      {/* 头部 vehicle 信息 */}
      <div className="mt-4 bg-[#1A1A2E] text-white rounded-xl p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="font-mono text-xs text-white/50 tracking-wide">
            RO #{ro.cccRoNumber}
          </div>
          <div className="text-xs text-white/50">{ro.shop.name}</div>
        </div>
        <div className="mt-2 text-2xl font-semibold">
          {ro.vehicleYear} {ro.vehicleMake} {ro.vehicleModel}
        </div>
        <div className="mt-1 text-xs text-white/40 font-mono">
          {ro.vehicleRaw}
        </div>
      </div>

      {/* PartLine 列表 */}
      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Part lines ({ro.partLines.length})
        </h2>

        <div className="space-y-2">
          {ro.partLines.map((pl) => {
            const hasSearched = pl.matchSearches.length > 0;
            const hasOrdered = pl.purchaseOrders.length > 0;
            const lastSearch = pl.matchSearches[0];

            return (
              <Link
                key={pl.id}
                href={`/ro/${ro.id}/search/${pl.id}`}
                className="relative block bg-white border border-gray-200 rounded-lg p-4 hover:border-[#00B4A6] hover:shadow-sm transition group"
              >
              <DeletePartLineButton
    partLineId={pl.id}
    partDescription={pl.partDescription}
  />
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-gray-400">
                        Line {pl.cccLineNumber}
                      </span>
                      {pl.partTypeRaw && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                          {pl.partTypeRaw}
                        </span>
                      )}
                      {pl.quantity > 1 && (
                        <span className="text-[11px] text-gray-500">
                          × {pl.quantity}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 font-medium text-[#1A1A2E]">
                      {pl.partDescription || (
                        <span className="text-gray-400 italic">
                          (no description)
                        </span>
                      )}
                    </div>

                    {pl.partNumber && (
                      <div className="mt-0.5 text-xs text-gray-500 font-mono">
                        {pl.partNumber}
                      </div>
                    )}

                    {pl.historicalPurchase?.actualCost && (
                      <div className="mt-1.5 text-[11px] text-gray-400">
                        Historically paid ${String(pl.historicalPurchase.actualCost)}
                        {pl.historicalPurchase.vendorName &&
                          ` at ${pl.historicalPurchase.vendorName}`}
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 flex flex-col items-end gap-1 self-center">
                    {hasOrdered && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">
                        Ordered
                      </span>
                    )}
                    {hasSearched && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700">
                        {lastSearch.candidateCount} results
                      </span>
                    )}
                    <span className="text-xs text-gray-400 group-hover:text-[#00B4A6] transition mt-1">
                      {hasSearched ? "View →" : "Search →"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}