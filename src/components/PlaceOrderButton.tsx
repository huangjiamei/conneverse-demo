/**
 * Place Order — disabled placeholder on every candidate.
 *
 * Replaces the old "Select" button that fed the Quote builder. Ordering isn't
 * built yet, so this never fires: it renders disabled everywhere and says so on
 * hover. Keeping it visible (rather than hiding it) preserves the card layout
 * and signals where ordering will live.
 *
 * Two sizes so the admin table rows and the customer result cards stay
 * consistent with the buttons they replaced.
 */

const COMING_SOON = "Ordering coming soon";

const SIZE = {
  sm: "px-3 py-1.5 text-[12px]",
  md: "px-5 py-2 text-[13px]",
} as const;

export function PlaceOrderButton({
  size = "sm",
  className = "",
}: {
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={COMING_SOON}
      aria-label={`Place Order — ${COMING_SOON}`}
      className={`shrink-0 inline-flex items-center gap-1 rounded-lg bg-gray-200 font-bold
                  text-gray-400 cursor-not-allowed whitespace-nowrap ${SIZE[size]} ${className}`}
    >
      Place Order
    </button>
  );
}

/** 按钮 + 一行灰字说明,用在有空间的卡片里 */
export function PlaceOrderAction({
  size = "sm",
  align = "end",
}: {
  size?: keyof typeof SIZE;
  align?: "end" | "start";
}) {
  return (
    <span
      className={`inline-flex flex-col gap-1 ${
        align === "end" ? "items-end" : "items-start"
      }`}
    >
      <PlaceOrderButton size={size} />
      <span className="text-[10px] text-gray-400 whitespace-nowrap">
        {COMING_SOON}
      </span>
    </span>
  );
}
