"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

// matcher raw candidate 类型 (给 page.tsx 用同一份)
export type RawCandidate = {
  item_id?: string;
  title?: string;
  subtitle?: string;
  price?: { value?: string; currency?: string } | null;
  condition?: string;
  item_web_url?: string;
  part_number_list?: string[];
  part_number_list_normalized?: string[];
  compatibility?: Record<string, unknown>;
  candidate_label?: number | null;
  candidate_label_source?: string;
  candidate_label_previous?: number | null;
  candidate_label_source_previous?: string;
  source_queries?: Array<{ level?: string; query?: string }>;
  ngram_fitment?: {
    decision?: string;
    confidence?: number;
    reasons?: string[];
    metrics?: Record<string, unknown>;
  };
  needs_llm_review?: boolean;
  llm_semantic_judgement?: Record<string, unknown>;
  optimizer_fields?: Record<string, unknown>;
  image_url?: string | null;
  additional_image_urls?: string[];
};

export type DebugCandidate = {
  id: string;
  rank: number;
  title: string;
  price: string;
  currency: string;
  itemUrl: string;
  condition: string | null;
  candidateLabel: number | null;
  labelSource: string | null;
  ebayItemId: string;
  optimizerRank: number | null;
  optimizerTotal: number | null;
  optimizerPriceScore: number | null;
  optimizerQualityScore: number | null;
  optimizerGateReason: string | null;
  imageUrl: string | null;
  raw: RawCandidate | null;
};

type Props = {
  title: string;
  subtitle: string;
  color: "gray" | "red";
  candidates: DebugCandidate[];
};

export default function DebugClient({
  title,
  subtitle,
  color,
  candidates,
}: Props) {
  const dotClass = color === "red" ? "bg-red-400" : "bg-gray-400";

  return (
    <section className="mt-6">
      <div className="mb-3">
        <h2 className="text-sm font-medium text-[#1A1A2E] flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
          {title}
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-6 text-center text-xs text-gray-400">
          No candidates in this category.
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => (
            <DebugCard key={c.id} candidate={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function DebugCard({ candidate }: { candidate: DebugCandidate }) {
  const [showRaw, setShowRaw] = useState(false);
  const raw = candidate.raw;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* 头部: 图 + 标题 + label 元信息 */}
      <div className="p-4 flex items-start gap-3">
        {candidate.imageUrl ? (
          <img
            src={candidate.imageUrl}
            alt=""
            className="w-[52px] h-[52px] object-cover rounded border border-gray-100 flex-shrink-0"
          />
        ) : (
          <div className="w-[52px] h-[52px] rounded border border-gray-100 bg-gray-50 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-mono text-gray-500">
            <span>#{candidate.rank}</span>
            <span>·</span>
            <span>${candidate.price}</span>
            {candidate.condition && (
              <>
                <span>·</span>
                <span>{candidate.condition}</span>
              </>
            )}
            <a
              href={candidate.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-0.5 text-gray-400 hover:text-[#00B4A6] transition"
            >
              eBay <ExternalLink size={9} />
            </a>
          </div>
          <div className="mt-1 text-sm text-[#1A1A2E] leading-snug">
            {candidate.title}
          </div>
          {raw?.subtitle && (
            <div className="mt-0.5 text-[11px] text-gray-500 italic">
              {raw.subtitle}
            </div>
          )}
        </div>
      </div>

      {/* 判定信息网格 */}
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[11px]">
        <Kv label="candidate_label" value={String(candidate.candidateLabel)} />
        <Kv label="label_source" value={candidate.labelSource ?? "-"} />
        <Kv label="ebay_item_id" value={candidate.ebayItemId} mono />

        {raw?.candidate_label_previous != null && (
          <Kv
            label="previous_label"
            value={`${raw.candidate_label_previous} (${raw.candidate_label_source_previous ?? "-"})`}
          />
        )}

        {candidate.optimizerRank != null && (
          <Kv label="optimizer_rank" value={String(candidate.optimizerRank)} />
        )}
        {candidate.optimizerTotal != null && (
          <Kv
            label="optimizer_score"
            value={`${candidate.optimizerTotal.toFixed(1)} (p ${candidate.optimizerPriceScore?.toFixed(0)} / q ${candidate.optimizerQualityScore?.toFixed(0)})`}
          />
        )}
        {candidate.optimizerGateReason && (
          <Kv label="gate_reason" value={candidate.optimizerGateReason} />
        )}
      </div>

      {/* ngram_fitment 详情 */}
      {raw?.ngram_fitment && (
        <div className="border-t border-gray-100 px-4 py-3 text-[11px]">
          <div className="font-medium text-gray-500 uppercase tracking-wide text-[10px] mb-1.5">
            ngram_fitment
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
            <Kv label="decision" value={raw.ngram_fitment.decision ?? "-"} />
            <Kv
              label="confidence"
              value={raw.ngram_fitment.confidence?.toFixed(3) ?? "-"}
            />
            {raw.ngram_fitment.metrics &&
              Object.entries(raw.ngram_fitment.metrics).map(([k, v]) => (
                <Kv
                  key={k}
                  label={k}
                  value={
                    typeof v === "number"
                      ? v.toFixed(3)
                      : Array.isArray(v)
                        ? v.length === 0
                          ? "[]"
                          : v.join(", ")
                        : String(v)
                  }
                />
              ))}
          </div>
          {raw.ngram_fitment.reasons &&
            raw.ngram_fitment.reasons.length > 0 && (
              <div className="mt-2 text-gray-600">
                <span className="text-gray-400">reasons:</span>{" "}
                {raw.ngram_fitment.reasons.join("; ")}
              </div>
            )}
        </div>
      )}

      {/* LLM 判定 (如果开了 use_llm) */}
      {raw?.llm_semantic_judgement && (
        <div className="border-t border-gray-100 px-4 py-3 text-[11px]">
          <div className="font-medium text-gray-500 uppercase tracking-wide text-[10px] mb-1.5">
            llm_semantic_judgement
          </div>
          <pre className="text-[10px] leading-tight bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(raw.llm_semantic_judgement, null, 2)}
          </pre>
        </div>
      )}

      {/* source_queries: matcher 是从哪档搜到这条的 */}
      {raw?.source_queries && raw.source_queries.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 text-[11px]">
          <div className="font-medium text-gray-500 uppercase tracking-wide text-[10px] mb-1.5">
            source_queries
          </div>
          <div className="flex flex-wrap gap-1.5">
            {raw.source_queries.map((sq, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-gray-700"
              >
                <span className="font-medium">{sq.level}</span>
                <span className="text-gray-500 font-mono">{sq.query}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* part_number_list + compatibility */}
      {raw && (raw.part_number_list?.length || raw.compatibility) && (
        <div className="border-t border-gray-100 px-4 py-3 text-[11px]">
          {raw.part_number_list && raw.part_number_list.length > 0 && (
            <div className="mb-2">
              <div className="font-medium text-gray-500 uppercase tracking-wide text-[10px] mb-1">
                part_numbers
              </div>
              <div className="font-mono text-[11px] text-gray-700">
                {raw.part_number_list.join(", ")}
              </div>
            </div>
          )}
          {raw.compatibility && Object.keys(raw.compatibility).length > 0 && (
            <div>
              <div className="font-medium text-gray-500 uppercase tracking-wide text-[10px] mb-1">
                compatibility
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
                {Object.entries(raw.compatibility)
                  .filter(([k]) => k !== "categoryPath")
                  .map(([k, v]) => (
                    <div key={k} className="text-gray-700">
                      <span className="text-gray-400">{k}:</span> {String(v)}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 完整 raw JSON */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-gray-500 hover:bg-gray-50 transition"
        >
          <span>Raw matcher output</span>
          {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showRaw && (
          <pre className="text-[10px] leading-tight bg-gray-900 text-gray-100 p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-gray-400">{label}</div>
      <div className={`text-gray-700 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
