/**
 * 三个数字 —— 数字刻意走系统 Helvetica 栈 (原稿 --sans),和通篇的衬线拉开对比。
 * 原稿 ≤960px 时三列变一列,竖分隔线换成横分隔线。
 */

import { Wrap, Eyebrow } from "./primitives";

const STATS = [
  { num: "30%", desc: "lower procurement costs on parts sourced through PartHand" },
  { num: "6 hrs", desc: "returned to each parts manager every week" },
  { num: "94%", desc: "first-time fitment rate on protected orders" },
];

export function Stats() {
  return (
    <section className="py-16 pb-16 mdx:py-[88px] mdx:pb-16">
      <Wrap>
        <Eyebrow>Measured across shops sourcing on PartHand</Eyebrow>
        <div className="mt-[34px] grid grid-cols-1 gap-7 mdx:grid-cols-3 mdx:gap-0">
          {STATS.map((s, i) => (
            <div
              key={s.num}
              className={`relative py-2 mdx:pr-11 ${
                i > 0
                  ? "border-t border-line pt-6 mdx:border-l mdx:border-t-0 mdx:pl-11 mdx:pt-2"
                  : ""
              }`}
            >
              <div className="font-num-ph text-[clamp(46px,6vw,68px)] font-bold leading-none tracking-[-0.03em] text-[#141410]">
                {s.num}
              </div>
              <div className="mt-4 max-w-[22em] font-serif-ph text-[16.5px] text-text-soft">
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </Wrap>
    </section>
  );
}
