/**
 * Hero —— 深色区块 + 两道径向渐变,右侧是 SourcingCard,底部一条 logo 带。
 * 原稿 ≤960px 时栅格收成单列、上内边距从 74px 降到 52px。
 */

import { Wrap, Btn, BtnLink, Eyebrow } from "./primitives";
import { SourcingCard } from "./SourcingCard";
import { BookDemoButton } from "./BookDemoButton";

const HERO_BG =
  "radial-gradient(720px 460px at 8% -6%, rgba(120,150,55,.16), transparent 60%)," +
  "radial-gradient(600px 400px at 100% 120%, rgba(90,120,50,.10), transparent 60%)," +
  "var(--color-ink)";

export function Hero() {
  return (
    <section className="pt-[52px] text-text-light mdx:pt-[74px]" style={{ background: HERO_BG }}>
      <Wrap>
        <div className="grid grid-cols-1 items-center gap-10 mdx:grid-cols-[1.04fr_.96fr] mdx:gap-[60px]">
          <div>
            <Eyebrow tone="dark" dot>
              A supply chain solution for the repair industry
            </Eyebrow>
            <h1 className="mb-[26px] mt-5 font-serif-ph text-[clamp(42px,6vw,74px)] font-semibold leading-[1.02] tracking-[-0.015em] text-[#f6f5ee]">
              Every parts channel, one search. Fitment, quality, and arrival guaranteed.
            </h1>
            <p className="m-0 max-w-[33em] font-serif-ph text-[19px] leading-[1.6] text-[#c9cabf]">
              PartHand pulls your supply channels into one place, checks fitment and
              quality before you commit, and puts the two options that matter in front
              of you — each with a real price and a real arrival date — in seconds, not
              tabs.
            </p>
            <div className="mt-[34px] flex flex-wrap gap-3.5">
              <BookDemoButton className="max-smx:flex-1" />
              <BtnLink href="#how" variant="outlineLight" className="max-smx:flex-1">
                See how it works
              </BtnLink>
            </div>
          </div>

          <SourcingCard />
        </div>
      </Wrap>

      <div className="mt-16 border-t border-line-dark">
        <Wrap className="py-[26px]">
          <div className="flex flex-wrap items-center gap-[26px]">
            <span className="mr-1.5 font-mono-ph text-[11.5px] uppercase tracking-[0.16em] text-muted-dark">
              Shops &amp; suppliers on PartHand
            </span>
            {/* 占位:等真 logo */}
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="flex h-[34px] w-24 flex-none items-center justify-center rounded-md border border-dashed border-[#33362c] font-mono-ph text-[12px] text-[#5a5d51]"
              >
                logo
              </span>
            ))}
          </div>
          <p className="mt-5 max-w-[52em] font-serif-ph text-[15.5px] leading-[1.55] text-[#c9cabf]">
            More qualified suppliers than any phone at the counter could reach — every
            one vetted, every part guaranteed.
          </p>
        </Wrap>
      </div>
    </section>
  );
}

/** Btn 是 client-only 的 (要 onClick),这里只是给 Hero 借个名字避免多一层文件 */
export { Btn };
