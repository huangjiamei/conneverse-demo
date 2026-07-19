/**
 * Quote Builder 侧栏 — RO 详情页右侧的累计汇总。
 *
 * 只用库里真实存在的数据:
 *   - PurchaseOrder.price × quantity      → 已下单实付
 *   - HistoricalPurchase.actualCost       → 历史基准价 (店以前付多少)
 *   - 两者都有的行才算 savings,避免拿没有基准的行虚报节省
 *
 * 注意: schema 里没有任何 labor 数据 (没有工时、没有 labor rate),
 * 所以这里不显示 Labor 小计。要加的话得先建模。
 */

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export type QuoteSummaryProps = {
  totalLines: number;
  orderedLines: number;
  searchedLines: number;
  /** 已下单行的实付合计 */
  partsSpend: number;
  /** 同一批已下单行的历史基准合计 (只含两边都有数的行) */
  baselineForOrdered: number;
  /** 有历史基准可比的已下单行数 */
  comparableLines: number;
};

export default function QuoteSummary({
  totalLines,
  orderedLines,
  searchedLines,
  partsSpend,
  baselineForOrdered,
  comparableLines,
}: QuoteSummaryProps) {
  const savings = baselineForOrdered - partsSpend;
  const savingsPct =
    baselineForOrdered > 0 ? (savings / baselineForOrdered) * 100 : null;

  return (
    <aside className="xl:sticky xl:top-20">
      {/* 标题提到卡片外,和左栏 "Part lines (N)" 用同一套 h2 样式对齐 */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
        Quote builder
      </h2>

      <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 space-y-2.5">
          <p className="text-[11px] text-gray-400">Ordered Details</p>
          <Row label="Parts ordered" value={`${orderedLines} of ${totalLines}`} />
          <Row label="Parts spend" value={usdCents.format(partsSpend)} strong />

          {comparableLines > 0 ? (
            <>
              <div className="h-px bg-gray-100 my-1" />
              <Row
                label="Historical baseline"
                value={usdCents.format(baselineForOrdered)}
                muted
              />
              <Row
                label="Savings"
                value={`${savings >= 0 ? "" : "−"}${usd.format(Math.abs(savings))}${
                  savingsPct != null ? ` (${Math.abs(savingsPct).toFixed(0)}%)` : ""
                }`}
                tone={savings >= 0 ? "positive" : "negative"}
                strong
              />
              <p className="text-[10px] text-gray-400 leading-snug pt-1">
                Compared across {comparableLines} of {orderedLines} ordered{" "}
                {orderedLines === 1 ? "line" : "lines"} that have a historical
                cost on file.
              </p>
            </>
          ) : (
            orderedLines > 0 && (
              <p className="text-[10px] text-gray-400 leading-snug pt-1">
                No historical cost on file for the ordered lines — savings can&apos;t
                be computed yet.
              </p>
            )
          )}
        </div>
      </div>

      {/* 进度 */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
        <h3 className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
          Progress
        </h3>
        <div className="mt-2.5 space-y-2">
          <Bar label="Searched" done={searchedLines} total={totalLines} tone="teal" />
          <Bar label="Ordered" done={orderedLines} total={totalLines} tone="amber" />
        </div>
      </div>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-red-600"
        : muted
          ? "text-gray-400"
          : "text-[#1A1A2E]";

  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-xs ${muted ? "text-gray-400" : "text-gray-500"}`}>
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? "text-sm font-semibold" : "text-xs"} ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function Bar({
  label,
  done,
  total,
  tone,
}: {
  label: string;
  done: number;
  total: number;
  tone: "teal" | "amber";
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const barColor = tone === "teal" ? "bg-[#00B4A6]" : "bg-amber-500";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-gray-500">{label}</span>
        <span className="text-[11px] text-gray-400 tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
