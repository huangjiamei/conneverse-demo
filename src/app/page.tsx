import { prisma } from "@/lib/prisma";
import UploadRoButton from "./UploadRoButton";
import RoListClient, { type RoListItem } from "./RoListClient";

export const dynamic = "force-dynamic";

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

  // 转成客户端友好的形状 (聚合 partLines 计数, 拍平 shop.name)
  const items: RoListItem[] = repairOrders.map((ro) => ({
    id: ro.id,
    cccRoNumber: ro.cccRoNumber,
    vehicleYear: ro.vehicleYear,
    vehicleMake: ro.vehicleMake,
    vehicleModel: ro.vehicleModel,
    shopName: ro.shop.name,
    totalParts: ro.partLines.length,
    searchedParts: ro.partLines.filter((pl) => pl._count.matchSearches > 0)
      .length,
    orderedParts: ro.partLines.filter((pl) => pl._count.purchaseOrders > 0)
      .length,
  }));

  return (
    <main className="max-w-[1440px] mx-auto p-8">
      <div className="mb-6 flex flex-row items-start justify-between">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold">Repair Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} orders imported from CCC
          </p>
        </div>
        <UploadRoButton />
      </div>

      <RoListClient repairOrders={items} />
    </main>
  );
}
