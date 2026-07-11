"use client";

/**
 * /embed — the SourcingPanel packaged for host embedding (Shell B).
 *
 * No app chrome: no banner, header, quote sidebar, or login redirect.
 * Context (vehicle + RO line) arrives via URL params or a host
 * `conneverse:context` postMessage; the selected lines go back via
 * `conneverse:quote-complete`. Contract: docs/embed.md.
 *
 * Theme-aware: hosts pass neutral colors (?bg=&surface=&text=&accent=)
 * which land on CSS variables — but Conneverse teal stays fixed on
 * guarantee badges, recognizable across hosts.
 *
 * SourcingPanel itself is untouched — context flows through the
 * ContextProvider seam.
 */

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useSearchParams } from "next/navigation";
import { Send, ShieldCheck } from "lucide-react";
import {
  SourcingProvider,
  useSourcing,
} from "@/context/SourcingContext";
import { SourcingPanel } from "@/components/sourcing/SourcingPanel";
import {
  HostSmsProvider,
  hostContextFromParams,
  type HostContext,
} from "@/lib/embed/host-sms-provider";
import { formatPrice } from "@/lib/format";

/**
 * Auto-applies the host's RO line once the seeded vehicle is live:
 * a known catalog partId searches immediately; free text lands in the
 * search box for the resolver.
 */
function AutoSelect({ ctx }: { ctx: HostContext }) {
  const { vehicleSelected, availableParts, selectPart, updateSearchQuery } =
    useSourcing();
  const applied = useRef(false);

  useEffect(() => {
    if (!vehicleSelected || applied.current || !ctx.line) return;
    applied.current = true;
    const byId = ctx.line.partId
      ? availableParts.find((p) => p.id === ctx.line!.partId)
      : undefined;
    if (byId) {
      selectPart(byId.id, byId.category, byId.name);
    } else {
      updateSearchQuery(ctx.line.description);
    }
  }, [vehicleSelected, availableParts, ctx, selectPart, updateSearchQuery]);

  return null;
}

/** Sticky writeback bar — the embed's "checkout". */
function EmbedFooter({ accent }: { accent: string }) {
  const { quoteItems, contextProvider } = useSourcing();
  const [sent, setSent] = useState(false);
  const total = quoteItems.reduce((s, l) => s + l.price * l.qty, 0);

  if (quoteItems.length === 0) return null;

  return (
    <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-sm text-dark">
        {quoteItems.length} line{quoteItems.length === 1 ? "" : "s"} ·{" "}
        <strong>{formatPrice(total)}</strong>
        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-gray-400">
          <ShieldCheck size={12} className="text-teal" />
          Fulfilled by Conneverse
        </span>
      </span>
      <button
        onClick={() => {
          contextProvider.onQuoteComplete(quoteItems);
          setSent(true);
        }}
        disabled={sent}
        style={{ backgroundColor: accent }}
        className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-white text-sm font-medium hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
      >
        <Send size={14} />
        {sent ? "Sent to estimate" : "Send to estimate"}
      </button>
    </div>
  );
}

function EmbedInner() {
  const params = useSearchParams();
  const urlCtx = useMemo(
    () => hostContextFromParams(new URLSearchParams(params.toString())),
    [params]
  );

  // Context can also arrive via postMessage (host → embed) before the
  // provider mounts — used by hosts that prefer not to put RO data in
  // URLs.
  const [msgCtx, setMsgCtx] = useState<HostContext | null>(null);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "conneverse:context" && e.data.vehicle) {
        setMsgCtx({
          vehicle: e.data.vehicle,
          line: e.data.line ?? null,
          targetOrigin: e.origin,
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const ctx = urlCtx.vehicle ? urlCtx : msgCtx;

  const provider = useMemo(
    () => (ctx ? new HostSmsProvider(ctx) : null),
    [ctx]
  );

  useEffect(() => {
    provider?.announceReady();
  }, [provider]);

  // Host theme neutrals — Conneverse teal on guarantees is NOT themable.
  const bg = params.get("bg") ?? "#F7F8FA";
  const surface = params.get("surface") ?? "#FFFFFF";
  const text = params.get("text") ?? "#1A1A2E";
  const accent = params.get("accent") ?? "#2EC4B6";

  if (!ctx || !provider) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">
        Waiting for host context&hellip; (vehicle via URL params or a
        conneverse:context message)
      </div>
    );
  }

  return (
    <div
      style={
        {
          background: bg,
          color: text,
          "--host-surface": surface,
          "--host-accent": accent,
        } as CSSProperties
      }
      className="min-h-screen flex flex-col"
    >
      <SourcingProvider contextProvider={provider}>
        <div className="flex-1 px-4 py-4">
          <SourcingPanel />
        </div>
        <AutoSelect ctx={ctx} />
        <EmbedFooter accent={accent} />
      </SourcingProvider>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={null}>
      <EmbedInner />
    </Suspense>
  );
}
