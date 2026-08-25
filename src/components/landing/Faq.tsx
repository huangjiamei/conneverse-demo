"use client";

/**
 * FAQ 手风琴 —— useState 管开合,默认第一条展开。
 *
 * 行为照原稿那段 script:同时只开一条,再点已展开的那条会收起 (原脚本先把
 * 所有条目 remove('open'),再判断 if(!open) 才加回去)。
 *
 * 展开动画沿用 max-height 过渡 (原稿 .faq-a{max-height:0} → .open 时 340px),
 * 不用 height:auto —— 那个过渡不了。
 */

import { useState } from "react";
import { Wrap, Eyebrow, SECTION_PAD } from "./primitives";

const ITEMS = [
  {
    q: "How is fitment guaranteed?",
    a: "Parts are matched against as-built vehicle data rather than a generic year-make-model lookup, and each option carries a fitment confidence you can see before ordering. If a protected line doesn't fit, the return and replacement are handled as part of the order.",
  },
  {
    q: "Which channels does PartHand search?",
    a: "OEM dealer networks, aftermarket distributors, recycled and refurbished suppliers, and your own preferred vendors — searched together and ranked side by side so you compare landed cost and arrival across all of them at once.",
  },
  {
    q: "What happens when a part arrives wrong or damaged?",
    a: "Flag it on the order and PartHand owns the correction: sourcing the replacement, arranging the return, and tracking the credit through to your account — so your technician isn't chasing suppliers.",
  },
  {
    q: "Does this replace my supplier relationships?",
    a: "No. PartHand sits on top of the suppliers you already use and lets you add new channels alongside them. You keep your accounts and terms; we just make them searchable in one place.",
  },
  {
    q: "How long does it take to get running?",
    a: "Most shops are sourcing live within a day. Connect your estimating or management system, confirm your supplier accounts, and start pushing jobs — no rip-and-replace of the tools you already run.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className={SECTION_PAD}>
      <Wrap>
        <div className="grid grid-cols-1 items-start gap-6 mdx:grid-cols-[.62fr_1fr] mdx:gap-14">
          <div>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-5 max-w-[12ch] font-serif-ph text-[clamp(30px,4.2vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">
              Questions shops ask first
            </h2>
          </div>

          <div>
            {ITEMS.map((item, i) => {
              const isOpen = openIndex === i;
              return (
                <div
                  key={item.q}
                  className={`border-t border-line ${i === ITEMS.length - 1 ? "border-b" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    className="flex w-full cursor-pointer items-center justify-between gap-5 border-0 bg-transparent px-0.5 py-6 text-left font-serif-ph text-[21px] font-semibold tracking-[-0.01em] text-text-ink"
                  >
                    {item.q}
                    <span className="flex-none font-serif-ph text-[24px] leading-none text-[#111]">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  <div
                    id={`faq-panel-${i}`}
                    className={`overflow-hidden transition-[max-height] duration-[320ms] ease-out ${
                      isOpen ? "max-h-[340px]" : "max-h-0"
                    }`}
                  >
                    <div className="max-w-[52em] px-0.5 pb-[26px] font-serif-ph text-[17px] leading-[1.6] text-text-soft">
                      {item.a}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Wrap>
    </section>
  );
}
