import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const repairOrders = await prisma.repairOrder.findMany({
    include: {
      shop: true,
      partLines: {
        select: {
          id: true,
          _count: { select: { matchSearches: true, purchaseOrders: true } },
        },
      },
    },
    orderBy: { cccRoNumber: "desc" },
  });

  return (
    <main className="max-w-4xl mx-auto p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Repair Orders</h1>
        <p className="text-sm text-gray-500 mt-1">
          {repairOrders.length} orders imported from CCC
        </p>
      </div>

      {repairOrders.length === 0 ? (
        <p className="text-gray-500">No repair orders yet.</p>
      ) : (
        <div className="space-y-3">
          {repairOrders.map((ro) => {
            const totalParts = ro.partLines.length;
            const searchedParts = ro.partLines.filter(
              (pl) => pl._count.matchSearches > 0
            ).length;
            const orderedParts = ro.partLines.filter(
              (pl) => pl._count.purchaseOrders > 0
            ).length;

            return (
              <Link
                key={ro.id}
                href={`/ro/${ro.id}`}
                className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs text-gray-500">
                      RO #{ro.cccRoNumber}
                    </div>
                    <div className="font-medium mt-1">
                      {ro.vehicleYear} {ro.vehicleMake} {ro.vehicleModel}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {ro.shop.name}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-gray-700 font-medium">
                      {totalParts} parts
                    </div>
                    {searchedParts > 0 && (
                      <div className="text-teal-600 mt-0.5">
                        {searchedParts} searched
                      </div>
                    )}
                    {orderedParts > 0 && (
                      <div className="text-amber-600 mt-0.5">
                        {orderedParts} ordered
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}