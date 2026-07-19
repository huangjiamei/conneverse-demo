import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DeletePartLineButton from "./DeletePartLineButton";
import QuoteSummary from "./QuoteSummary";

export const dynamic = "force-dynamic";

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
            include: {
              candidates: {
                where: { candidateLabel: 1 },
                select: { id: true },
              },
            },
          },
          purchaseOrders: {
            take: 1,
          },
        },
      },
    },
  });

  if (!ro) notFound();

  // 侧栏汇总。只统计已下单行;savings 只算历史成本和实付都有的行,
  // 否则会拿没有基准的行虚报节省。
  let partsSpend = 0;
  let baselineForOrdered = 0;
  let orderedLines = 0;
  let comparableLines = 0;
  let searchedLines = 0;

  for (const pl of ro.partLines) {
    if (pl.matchSearches.length > 0) searchedLines++;

    const po = pl.purchaseOrders[0];
    if (!po) continue;

    orderedLines++;
    partsSpend += Number(po.price) * po.quantity;

    // 假设: historicalPurchase.actualCost 是该行的总额 (CCC 会计口径,
    // 和 extendedSales 对应),所以不再乘 quantity。如果实际是单价,
    // 这里要改成 * po.quantity。
    const baseline = pl.historicalPurchase?.actualCost;
    if (baseline != null) {
      comparableLines++;
      baselineForOrdered += Number(baseline);
    }
  }

  return (
    <main className="w-full max-w-[1440px] mx-auto p-8">
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
        <div className="mt-1 text-xs text-white/40 font-mono italic">
          Original: {ro.vehicleRaw}
        </div>
      </div>

      {/* 两栏: 左 part lines, 右 quote builder。<lg 时侧栏堆到下面 */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Part lines ({ro.partLines.length})
          </h2>

          {/*
            part 少于 3 个时不分列: 两列会把每张卡切到 ~492px,
            孤零零两张小卡看着比单列 992px 还窄。
            auto-rows-fr + 卡片 h-full 保证同页卡片等高。
          */}
          <div
            className={`grid gap-2 auto-rows-fr ${
              ro.partLines.length >= 2 ? "lg:grid-cols-2" : ""
            }`}
          >
          {ro.partLines.map((pl) => {
            const hasSearched = pl.matchSearches.length > 0;
            const hasOrdered = pl.purchaseOrders.length > 0;
            const lastSearch = pl.matchSearches[0];

            return (
              <Link
                key={pl.id}
                href={`/ro/${ro.id}/search/${pl.id}`}
                className="relative h-full min-h-[140px] flex flex-col bg-white border border-gray-200 rounded-lg p-4 hover:border-[#00B4A6] hover:shadow-sm transition group"
              >
                <DeletePartLineButton
                  partLineId={pl.id}
                  partDescription={pl.partDescription}
                />
                {/* 上: Line + 类型 + part number 同一行。pr-5 避开删除按钮 */}
                <div className="flex items-center gap-2 flex-wrap pr-5">
                  <span className="font-mono text-[11px] text-gray-400">
                    Line {pl.cccLineNumber}
                  </span>
                  {pl.partTypeRaw && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                      {pl.partTypeRaw}
                    </span>
                  )}
                  {pl.partNumber && (
                    <span className="text-xs text-gray-500 font-mono truncate">
                      {pl.partNumber}
                    </span>
                  )}
                  {pl.quantity > 1 && (
                    <span className="text-[11px] text-gray-500">
                      × {pl.quantity}
                    </span>
                  )}
                </div>
                {pl.partNumberRaw && pl.partNumberRaw !== pl.partNumber && (
                  <div className="mt-0.5 text-[11px] text-gray-400 italic font-mono truncate">
                    Original: {pl.partNumberRaw}
                  </div>
                )}

                {/* 中: 描述 (左) 与状态徽章 (右) 同一行,flex-1 吃满剩余高度 */}
                <div className="flex-1 flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <div className="font-medium text-[#1A1A2E]">
                      {pl.partDescription || (
                        <span className="text-gray-400 italic">
                          (no description)
                        </span>
                      )}
                    </div>
                    {pl.partDescriptionRaw &&
                      pl.partDescriptionRaw !== pl.partDescription && (
                        <div className="mt-0.5 text-[11px] text-gray-400 italic">
                          Original: {pl.partDescriptionRaw}
                        </div>
                      )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {hasOrdered && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">
                        Ordered
                      </span>
                    )}
                    {hasSearched && (
                      <>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700">
                          {lastSearch.candidates.length} verified
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                          {lastSearch.candidateCount} total
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* 下: historically paid (左) 与入口 (右)。
                    没有历史价时渲染 &nbsp; 占位,保证这一行高度恒定,
                    上面的描述区才不会在有/无历史价的卡之间错位。 */}
                <div className="flex items-baseline justify-between gap-4">
                  <div className="text-[11px] text-gray-400 min-w-0 truncate">
                    {pl.historicalPurchase?.actualCost ? (
                      <>
                        Historically paid $
                        {String(pl.historicalPurchase.actualCost)}
                        {pl.historicalPurchase.vendorName &&
                          ` at ${pl.historicalPurchase.vendorName}`}
                      </>
                    ) : (
                      " "
                    )}
                  </div>
                  <span className="text-xs text-gray-400 group-hover:text-[#00B4A6] transition shrink-0">
                    {hasSearched ? "View →" : "Search →"}
                  </span>
                </div>
              </Link>
            );
          })}
          </div>
        </div>

        <QuoteSummary
          totalLines={ro.partLines.length}
          orderedLines={orderedLines}
          searchedLines={searchedLines}
          partsSpend={partsSpend}
          baselineForOrdered={baselineForOrdered}
          comparableLines={comparableLines}
        />
      </div>
    </main>
  );
}
