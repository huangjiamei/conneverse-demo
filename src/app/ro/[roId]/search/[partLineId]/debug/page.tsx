import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DebugClient, {
  type DebugCandidate,
  type RawCandidate,
} from "./DebugClient";

export const dynamic = "force-dynamic";

type RawResponse = {
  source_part_info?: Record<string, unknown>;
  candidate_info_list?: RawCandidate[];
  label?: number | null;
  label_source?: string;
  dataset_meta?: Record<string, unknown>;
  optimizer_result?: Record<string, unknown>;
};

export default async function DebugPage({
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

  if (!latestSearch) {
    return (
      <main className="w-full max-w-[1440px] mx-auto p-8">
        <Link
          href={`/ro/${roId}/search/${partLineId}`}
          className="text-sm text-gray-500 hover:text-gray-700 transition inline-flex items-center gap-1"
        >
          ← Back to search
        </Link>
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
          No search has been run for this part line yet.
        </div>
      </main>
    );
  }

  // 把 raw candidate 按 item_id 索引
  const raw = (latestSearch.rawResponse as RawResponse) || {};
  const rawByItemId = new Map<string, RawCandidate>();
  for (const c of raw.candidate_info_list ?? []) {
    if (c.item_id) rawByItemId.set(c.item_id, c);
  }

  const merged: DebugCandidate[] = latestSearch.candidates
    .filter((c) => c.candidateLabel !== 1)
    .map((c) => ({
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
      imageUrl: c.imageUrl,
      raw: rawByItemId.get(c.ebayItemId) ?? null,
    }));

  const uncertain = merged.filter((c) => c.candidateLabel === null);
  const rejected = merged.filter((c) => c.candidateLabel === 0);
  const verifiedCount = latestSearch.candidates.filter(
    (c) => c.candidateLabel === 1,
  ).length;

  return (
    <main className="max-w-[1440px] mx-auto p-8">
      <Link
        href={`/ro/${roId}/search/${partLineId}`}
        className="text-sm text-gray-500 hover:text-gray-700 transition inline-flex items-center gap-1"
      >
        ← Back to search
      </Link>

      {/* 头部 */}
      <div className="mt-4 bg-[#1A1A2E] text-white rounded-xl p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs text-white/50 tracking-wide">
              Debug view · RO #{ro.cccRoNumber}
            </div>
            <div className="mt-1 text-xl font-semibold">
              {ro.vehicleYear} {ro.vehicleMake} {ro.vehicleModel}
            </div>
            <div className="mt-0.5 text-sm text-white/70">
              {partLine.partDescription}
              {partLine.partNumber && (
                <span className="ml-2 font-mono text-xs text-white/50">
                  MPN {partLine.partNumber}
                </span>
              )}
            </div>
          </div>
          <div className="text-xs text-white/50 font-mono">
            Search {latestSearch.id.slice(0, 8)}
          </div>
        </div>
      </div>

      {/* MatchSearch 顶层元信息 */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Search summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Metric
            label="matcher label"
            value={String(latestSearch.matcherLabel)}
          />
          <Metric
            label="label_source"
            value={latestSearch.labelSource ?? "-"}
          />
          <Metric
            label="candidate count"
            value={String(latestSearch.candidateCount)}
          />
          <Metric
            label="verified / uncertain / rejected"
            value={`${verifiedCount} / ${uncertain.length} / ${rejected.length}`}
          />
        </div>
        {raw.dataset_meta && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
              dataset_meta ↓
            </summary>
            <pre className="mt-2 text-[10px] leading-tight bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(raw.dataset_meta, null, 2)}
            </pre>
          </details>
        )}
        {raw.optimizer_result && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
              optimizer_result ↓
            </summary>
            <pre className="mt-2 text-[10px] leading-tight bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(raw.optimizer_result, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <DebugClient
        title={`Uncertain (${uncertain.length})`}
        subtitle="candidate_label = null — matcher couldn't decide, usually MPN missing or n-gram/LLM route to review"
        color="gray"
        candidates={uncertain}
      />

      <DebugClient
        title={`Rejected (${rejected.length})`}
        subtitle="candidate_label = 0 — matcher decided not a match (noisy negative / n-gram reject / …)"
        color="red"
        candidates={rejected}
      />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-xs text-[#1A1A2E]">{value}</div>
    </div>
  );
}
