"use client";

/**
 * User-side results view (§0/§1/§2/§4).
 *
 * No preset selector. Shows up to 5: two default-expanded heroes
 * (Cheapest / Fastest, or a single "Best overall") + up to 3 collapsed
 * alternates that expand into the same card.
 *
 * Removed vs the admin card: eBay link, Seller block, Purchase's In stock /
 * sold. Only Returns survives, merged into the Details line.
 */

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
import {
  type Candidate,
  formatDeliveryRange,
  formatWarranty,
} from "@/components/CandidateCard";
import { PlaceOrderButton } from "@/components/PlaceOrderButton";
import type { OrderingContext } from "@/lib/userResultsData";
import type { HeroBadge } from "@/lib/userResults";

export type UserHero = { candidate: Candidate; badge: HeroBadge };

const BADGE_META: Record<
  HeroBadge,
  { label: string; bg: string; text: string; border: string }
> = {
  value: { label: "Cheapest", bg: "#fef3c7", text: "#b45309", border: "#f1c98a" },
  fast: { label: "Fastest", bg: "#fee2e2", text: "#dc2626", border: "#f6b6b6" },
  best: { label: "Best overall", bg: "#fce7f3", text: "#be185d", border: "#f3b0cd" },
};

// ---- helpers ------------------------------------------------

function shortTitle(title: string, n = 40): string {
  return title.length > n ? title.slice(0, n).trimEnd() + "…" : title;
}

// 主标识: brand 若有效 → brand + muted 短标题副标; 否则回退短标题。
function mainIdentifier(c: Candidate): { name: string; sub: string | null } {
  const brand = c.brand?.trim();
  if (brand && brand.toLowerCase() !== "unbranded") {
    return { name: brand, sub: `— ${shortTitle(c.title)}` };
  }
  return { name: shortTitle(c.title), sub: null };
}

function readableReturns(c: Candidate): string {
  const ef = c.enrichedFields || {};
  if (ef.returns_accepted === true) {
    return ef.return_period_days ? `${ef.return_period_days} days` : "Accepted";
  }
  return "—";
}

/**
 * §4:显示价永远是服务端算好的 quotedPrice —— 店铺所见即所付。
 *
 * 这里以前自己拿 price + shipping 拼 landed。下单接口也要算一次同样的数,
 * 两份实现迟早对不上,而这个数就是刷卡金额,不能靠"应该一样"。现在浏览器
 * 不参与定价,只负责把服务端给的数字印出来。
 *
 * quotedPrice 为 null = 运费算不出 → 报不了全包价 → 不给即时下单 (B3)。
 */
function cardPrice(c: Candidate): {
  main: string;
  sub: { text: string; tone: "muted" | "amber" } | null;
} {
  if (c.quotedPrice == null) {
    return { main: "—", sub: { text: "Quote needed", tone: "amber" } };
  }
  const ef = c.enrichedFields || {};
  const delivery = formatDeliveryRange(ef.delivery_min_date, ef.delivery_max_date);
  return {
    main: `$${c.quotedPrice}`,
    sub: {
      text: `Delivered price${delivery ? ` · ${delivery}` : ""}`,
      tone: "muted",
    },
  };
}

/** §4 (collapsed row): 同上,报不了价时用琥珀色标出来 */
function rowPrice(c: Candidate): { main: string; note: string | null } {
  if (c.quotedPrice == null) return { main: "—", note: "Quote needed" };
  return { main: `$${c.quotedPrice}`, note: null };
}

// ---- gallery (switch + zoom) --------------------------------

function Gallery({
  candidate,
  onZoom,
}: {
  candidate: Candidate;
  onZoom: (gallery: string[], index: number) => void;
}) {
  const images = Array.from(
    new Set(
      [candidate.imageUrl, ...(candidate.additionalImageUrls ?? [])].filter(
        (u): u is string => !!u
      )
    )
  );
  const [idx, setIdx] = useState(0);
  if (images.length === 0) return null;
  const active = Math.min(idx, images.length - 1);
  const hero = images[active];

  return (
    <div className="shrink-0 w-[200px]">
      {/* 点主图 → 在当前 active 索引打开 lightbox (不是点缩略图) */}
      <button
        type="button"
        onClick={() => onZoom(images, active)}
        className="relative block w-[200px] h-[200px] rounded-xl overflow-hidden border border-gray-200 cursor-zoom-in"
      >
        <Image src={hero} alt={candidate.title} fill sizes="200px" className="object-cover" />
        <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded">
          Click to zoom
        </span>
      </button>
      {images.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {images.map((u, i) => (
            <button
              type="button"
              key={u}
              onClick={() => setIdx(i)}
              className={`block w-11 h-11 rounded-md overflow-hidden border transition ${
                i === active
                  ? "border-[#00B4A6] ring-1 ring-[#00B4A6]"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <Image src={u} alt="" width={44} height={44} className="w-11 h-11 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- expanded card (heroes + expanded alternates) -----------

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-gray-100 pt-2.5 mt-2.5 first:border-t-0 first:pt-0 first:mt-0">
      <div className="text-[10px] font-semibold tracking-wide uppercase text-gray-400 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function ExpandedCard({
  candidate,
  badge,
  onZoom,
  ordering,
  partLineId,
  defaultQuantity,
}: {
  candidate: Candidate;
  badge?: HeroBadge;
  onZoom: (gallery: string[], index: number) => void;
  ordering: OrderingContext;
  partLineId: string | null;
  defaultQuantity: number;
}) {
  const px = cardPrice(candidate);
  const compat = candidate.compatibility
    ? Object.entries(candidate.compatibility).filter(([k]) => k !== "categoryPath")
    : [];
  const pns = candidate.partNumbers ?? [];
  const warranty = formatWarranty(candidate.enrichedFields?.warranty_raw);
  const bm = badge ? BADGE_META[badge] : null;

  return (
    <div
      className="relative bg-white border rounded-2xl p-5 flex flex-col sm:flex-row gap-5"
      style={bm ? { borderColor: bm.border } : { borderColor: "#e5e7eb" }}
    >
      {bm && (
        <span
          className="absolute -top-3 left-4 text-[12px] font-extrabold px-3 py-0.5 rounded-xl"
          style={{ backgroundColor: bm.bg, color: bm.text }}
        >
          {bm.label}
        </span>
      )}

      <Gallery candidate={candidate} onZoom={onZoom} />

      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-bold leading-snug text-[#1f2937]">
          {candidate.title}
        </div>

        {compat.length > 0 && (
          <Section label="Compatibility">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-gray-700">
              {compat.map(([k, v]) => (
                <span key={k}>
                  <span className="text-gray-400">{k}:</span> {String(v)}
                </span>
              ))}
            </div>
          </Section>
        )}

        {pns.length > 0 && (
          <Section label="Part numbers">
            <div className="text-[13px] text-gray-700">
              {pns.slice(0, 6).join(" · ")}
              {pns.length > 6 && (
                <span className="text-gray-400"> +{pns.length - 6} more</span>
              )}
            </div>
          </Section>
        )}

        <Section label="Details">
          <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-[13px] text-gray-700">
            <span>
              <span className="text-gray-400">Condition:</span>{" "}
              {candidate.condition ?? "—"}
            </span>
            <span>
              <span className="text-gray-400">Warranty:</span> {warranty ?? "—"}
            </span>
            <span>
              <span className="text-gray-400">Returns:</span>{" "}
              {readableReturns(candidate)}
            </span>
          </div>
        </Section>

        <div className="flex items-end justify-between gap-3 pt-3 mt-2 border-t border-gray-100">
          <div>
            <div className="text-[20px] font-extrabold text-[#1f2937]">
              {px.main}
            </div>
            {px.sub && (
              <div
                className={`text-[12px] mt-0.5 ${
                  px.sub.tone === "amber"
                    ? "text-amber-600 font-semibold"
                    : "text-gray-500"
                }`}
              >
                {px.sub.text}
              </div>
            )}
          </div>
          <PlaceOrderButton
            size="md"
            ordering={ordering}
            target={{
              candidateId: candidate.id,
              quotedPrice: candidate.quotedPrice,
              quoteBlockedReason: candidate.quoteBlockedReason,
              partLineId,
              defaultQuantity,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---- collapsed alternate row --------------------------------

function AlternateRow({
  candidate,
  onZoom,
  ordering,
  partLineId,
  defaultQuantity,
}: {
  candidate: Candidate;
  onZoom: (gallery: string[], index: number) => void;
  ordering: OrderingContext;
  partLineId: string | null;
  defaultQuantity: number;
}) {
  const [open, setOpen] = useState(false);
  const id = mainIdentifier(candidate);
  const delivery = formatDeliveryRange(
    candidate.enrichedFields?.delivery_min_date,
    candidate.enrichedFields?.delivery_max_date
  );
  const rp = rowPrice(candidate);

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-[#00B4A6] transition"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate text-[#1f2937]">
            {id.name}
            {id.sub && (
              <span className="font-normal text-gray-500 text-[12.5px]">
                {" "}
                {id.sub}
              </span>
            )}
          </div>
        </div>
        <div className="text-[13px] text-gray-700 shrink-0 whitespace-nowrap">
          {delivery ?? "—"}
        </div>
        <div className="shrink-0 min-w-[76px] text-right">
          <div className="text-[15px] font-bold text-[#1f2937]">{rp.main}</div>
          {rp.note && (
            <div className="text-[11px] text-amber-600 font-medium leading-tight">
              {rp.note}
            </div>
          )}
        </div>
        <PlaceOrderButton
          size="sm"
          ordering={ordering}
          target={{
            candidateId: candidate.id,
            quotedPrice: candidate.quotedPrice,
            quoteBlockedReason: candidate.quoteBlockedReason,
            partLineId,
            defaultQuantity,
          }}
        />
        <ChevronDown
          size={16}
          className={`text-gray-400 shrink-0 transition ${open ? "rotate-180" : ""}`}
        />
      </div>
      {open && (
        <div className="mt-1.5">
          <ExpandedCard
            candidate={candidate}
            onZoom={onZoom}
            ordering={ordering}
            partLineId={partLineId}
            defaultQuantity={defaultQuantity}
          />
        </div>
      )}
    </div>
  );
}

// eBay 缩略图 URL (s-l140 / s-l225 / s-l500 …) → s-l1600 高清原图。
// 放大靠的是这一步: 用 500px 图去 scale(2.5) 只会糊。
// thumbs/ 路径下的资源没有大图, 需要先去掉这一段。
function hiResImage(url: string): string {
  if (!/i\.ebayimg\.com/.test(url)) return url;
  return url
    .replace("/thumbs/images/", "/images/")
    .replace(/\/s-l\d+(?=\.[a-z]+(?:$|\?))/i, "/s-l1600");
}

const FIT_SCALE = 1;
const CLICK_ZOOM_SCALE = 2.5;
const MAX_SCALE = 4;
const CENTER_ORIGIN = "50% 50%";

// ---- lightbox (single page-level instance) ------------------
// gallery + 起始 index 从触发的卡片传入; 内部管理 index (prev/next 环绕),
// 键盘 ← / → / Esc, 底部 k/n 计数; n<=1 隐藏箭头和计数。
// 背景点击 / ✕ / Esc 关闭; 点图片本身和箭头不关 (stopPropagation)。
//
// 细节放大: .big 是 overflow:hidden 的视口, 内层 <img> 是被缩放的层。
// 点图 → fit(1) / zoom(2.5) 互切; 滚轮 → 无级缩放 clamp [1, 4];
// 放大后 mousemove 把 transform-origin 挪到光标处实现平移。
// 关闭和切图都回到 fit。

function Lightbox({
  gallery,
  index: initialIndex,
  onClose,
}: {
  gallery: string[];
  index: number;
  onClose: () => void;
}) {
  const n = gallery.length;
  const [index, setIndex] = useState(initialIndex);
  const go = (dir: number) => setIndex((i) => (i + dir + n) % n);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(FIT_SCALE);
  const [origin, setOrigin] = useState(CENTER_ORIGIN);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const zoomed = scale > FIT_SCALE;

  // 换图回到 fit (初次挂载也无所谓, 本来就是 fit)
  useEffect(() => {
    setScale(FIT_SCALE);
    setOrigin(CENTER_ORIGIN);
  }, [index]);

  // 光标在视口内的百分比位置 → transform-origin
  const originFromEvent = (e: { clientX: number; clientY: number }) => {
    const box = viewportRef.current?.getBoundingClientRect();
    if (!box) return null;
    const pct = (v: number) => Math.min(100, Math.max(0, v)).toFixed(2);
    return `${pct(((e.clientX - box.left) / box.width) * 100)}% ${pct(
      ((e.clientY - box.top) / box.height) * 100
    )}%`;
  };

  // wheel 必须是 non-passive 才能 preventDefault (React 的 onWheel 是 passive 的),
  // 所以手动挂原生监听。scaleRef 让监听只注册一次。
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const prev = scaleRef.current;
      const next = Math.min(
        MAX_SCALE,
        Math.max(FIT_SCALE, prev - e.deltaY * 0.003 * prev)
      );
      if (next === prev) return;
      setOrigin(
        next > FIT_SCALE ? (originFromEvent(e) ?? origin) : CENTER_ORIGIN
      );
      setScale(next);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 键盘: 仅在打开时监听 (组件仅在打开时挂载)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (n > 1 && e.key === "ArrowLeft") setIndex((i) => (i - 1 + n) % n);
      else if (n > 1 && e.key === "ArrowRight") setIndex((i) => (i + 1 + n) % n);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onClose]);

  const src = gallery[index] ?? gallery[0];
  if (!src) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/85 flex items-center justify-center p-6 sm:p-12 cursor-zoom-out"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-5 text-white/80 hover:text-white text-3xl font-light leading-none"
      >
        ×
      </button>

      {/* 箭头在图片两侧 (容器外侧, 不压图); 计数在图片正下方 */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(72vw,620px)] h-[min(72vw,620px)] cursor-default"
      >
        {/* .big: 缩放视口, overflow-hidden 把放大溢出的部分裁掉 */}
        <div
          ref={viewportRef}
          onClick={(e) => {
            e.stopPropagation(); // 点图不关灯箱
            if (zoomed) {
              setScale(FIT_SCALE);
              setOrigin(CENTER_ORIGIN);
            } else {
              setOrigin(originFromEvent(e) ?? CENTER_ORIGIN);
              setScale(CLICK_ZOOM_SCALE);
            }
          }}
          // 放大后光标即 pan: origin 跟着光标走 (transform-origin 不参与
          // transition, 所以平移是跟手的, 只有 scale 变化会缓动)
          onMouseMove={(e) => {
            if (!zoomed) return;
            const o = originFromEvent(e);
            if (o) setOrigin(o);
          }}
          className={`big absolute inset-0 overflow-hidden rounded-xl ${
            zoomed ? "cursor-zoom-out" : "cursor-zoom-in"
          }`}
        >
          {/* 高清源 + transform 缩放层; 用原生 <img> 避开 next/image 的降采样 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hiResImage(src)}
            alt=""
            draggable={false}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: origin,
              transition: "transform 120ms ease-out",
            }}
            className="w-full h-full object-contain select-none will-change-transform"
          />
        </div>

        {n > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label="Previous"
              className="absolute right-full mr-3 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white cursor-pointer"
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label="Next"
              className="absolute left-full ml-3 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white cursor-pointer"
            >
              <ChevronRight size={26} />
            </button>

            <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 text-white/80 text-sm tabular-nums">
              {index + 1} / {n}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- top level ----------------------------------------------

export type UserResultsContext = {
  part: string;
  vehicle: string;
  category: string | null;
};

// SourcingProvider 由 page 持有 (QuoteBuilder 要在同一个 provider 里),
// 这里只负责把车辆/零件写进 quote context 供 PDF 用。
export default function UserResults({
  context,
  ordering,
  heroes,
  alternates,
  partLineId = null,
  defaultQuantity = 1,
}: {
  context: UserResultsContext;
  /** 下单前提 (角色 / 店铺地址) —— 服务端算好, 卡片只负责显示 */
  ordering: OrderingContext;
  heroes: UserHero[];
  alternates: Candidate[];
  /** 从 RO 行进来时挂上去, 独立搜索为 null */
  partLineId?: string | null;
  /** RO 行的数量作为默认值 */
  defaultQuantity?: number;
}) {
  // 整页共用一个 lightbox: 每次打开只重置 gallery + 起始 index
  const [lightbox, setLightbox] = useState<{
    gallery: string[];
    index: number;
  } | null>(null);
  const openLightbox = (gallery: string[], index: number) =>
    setLightbox({ gallery, index });

  return (
    <div>
      <div className="flex flex-col gap-4">
        {heroes.map((h) => (
          <ExpandedCard
            key={h.candidate.id}
            candidate={h.candidate}
            badge={h.badge}
            onZoom={openLightbox}
            ordering={ordering}
            partLineId={partLineId}
            defaultQuantity={defaultQuantity}
          />
        ))}
      </div>

      {alternates.length > 0 && (
        <>
          <h3 className="text-[13px] font-bold tracking-wide uppercase text-gray-500 mt-7 mb-3">
            Other options
          </h3>
          <div className="flex flex-col gap-2.5">
            {alternates.map((a) => (
              <AlternateRow
                key={a.id}
                candidate={a}
                onZoom={openLightbox}
                ordering={ordering}
                partLineId={partLineId}
                defaultQuantity={defaultQuantity}
              />
            ))}
          </div>
        </>
      )}

      {lightbox && (
        <Lightbox
          gallery={lightbox.gallery}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
