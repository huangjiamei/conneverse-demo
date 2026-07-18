import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SearchClient from "./SearchClient";

export const dynamic = "force-dynamic";

// matcher rawResponse.candidate_info_list[i] 的结构 (只挑要用的)
type RawCandidate = {
  item_id?: string;
  compatibility?: Record<string, unknown>;
  optimizer_fields?: {
    seller_username?: string | null;
    seller_feedback_pct?: string | number | null;
    seller_feedback_count?: number | null;
    top_rated?: boolean | null;
    availability_status?: string | null;
    available_qty?: number | null;
    sold_qty?: number | null;
    shipping_cost?: string | number | null;
    delivery_min_date?: string | null;
    delivery_max_date?: string | null;
    returns_accepted?: boolean | null;
    return_period_days?: number | null;
    warranty_raw?: string | null;
    country?: string | null;
  };
};

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
      historicalPurchase: true,
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

  // 从 rawResponse.candidate_info_list 里按 item_id 建 lookup, 拿 enrichedFields / brand / compatibility
  let rawByItemId = new Map<string, RawCandidate>();
  if (latestSearch?.rawResponse) {
    const raw = latestSearch.rawResponse as {
      candidate_info_list?: RawCandidate[];
    };
    for (const c of raw.candidate_info_list ?? []) {
      if (c.item_id) rawByItemId.set(c.item_id, c);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-8">
      <Link
        href={`/ro/${roId}`}
        className="text-sm text-gray-500 hover:text-gray-700 transition inline-flex items-center gap-1"
      >
        ← Back to RO #{ro.cccRoNumber}
      </Link>

      <div className="mt-4 bg-[#1A1A2E] text-white rounded-xl p-6">
        <div className="text-xs text-white/50 tracking-wide">Searching for</div>
        <div className="mt-1 text-xl font-semibold">
          {ro.vehicleYear} {ro.vehicleMake} {ro.vehicleModel}
        </div>
      </div>

      <SearchClient
        partLineId={partLine.id}
        initialPartDescription={partLine.partDescription}
        initialPartDescriptionRaw={partLine.partDescriptionRaw}
        initialPartNumber={partLine.partNumber}
        initialPartNumberRaw={partLine.partNumberRaw}
        partType={partLine.partTypeRaw}
        cccLineNumber={partLine.cccLineNumber}
        historicalPurchase={
          partLine.historicalPurchase
            ? {
                actualCost: partLine.historicalPurchase.actualCost
                  ? String(partLine.historicalPurchase.actualCost)
                  : null,
                vendorName: partLine.historicalPurchase.vendorName,
              }
            : null
        }
        latestSearch={
          latestSearch
            ? {
                id: latestSearch.id,
                createdAt: latestSearch.createdAt.toISOString(),
                label: latestSearch.matcherLabel,
                labelSource: latestSearch.labelSource,
                candidateCount: latestSearch.candidateCount,
                candidates: latestSearch.candidates.map((c) => {
                  const raw = rawByItemId.get(c.ebayItemId);
                  const compat = raw?.compatibility || {};
                  const brand =
                    (compat.Brand as string) || (compat.Make as string) || null;
                  return {
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
                    optimizerRank: c.optimizerRank,
                    optimizerTotal: c.optimizerTotal,
                    optimizerPriceScore: c.optimizerPriceScore,
                    optimizerQualityScore: c.optimizerQualityScore,
                    optimizerGateReason: c.optimizerGateReason,
                    brand,
                    enrichedFields: raw?.optimizer_fields ?? null,
                    compatibility:
                      (raw?.compatibility as Record<string, unknown>) ?? null,
                    imageUrl: c.imageUrl,
                    additionalImageUrls:
                      (raw as any)?.additional_image_urls ?? [],
                  };
                }),
              }
            : null
        }
      />
    </main>
  );
}
