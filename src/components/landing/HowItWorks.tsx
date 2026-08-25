/** 三步走。每步顶上一条细横线 (原稿 .step .rule)。 */

import { Wrap, Eyebrow, SECTION_PAD } from "./primitives";

const STEPS = [
  {
    no: "01",
    title: "Send the job",
    body: "Push an estimate from your estimating system, drop in a VIN and a part list, or just type the part. No re-keying, no separate portal per supplier.",
  },
  {
    no: "02",
    title: "See every option at once",
    body: "PartHand searches OEM, aftermarket, recycled, and refurbished channels together, then ranks what comes back by fitment confidence, condition, landed price, and arrival date.",
  },
  {
    no: "03",
    title: "Order with protection",
    body: "Every line carries a fitment check, a quality standard, and a return path. If the wrong part shows up, PartHand owns getting it corrected — not your technician.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className={`border-t border-line ${SECTION_PAD} mdx:pt-20`}>
      <Wrap>
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-[22px] max-w-[20ch] font-serif-ph text-[clamp(30px,4.2vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">
          One request. Every option. A part you can stand behind.
        </h2>
        <div className="mt-14 grid grid-cols-1 gap-9 mdx:grid-cols-3 mdx:gap-11">
          {STEPS.map((s) => (
            <div key={s.no}>
              <div className="mb-[22px] h-px bg-[#111] opacity-[.85]" />
              <div className="mb-3.5 font-mono-ph text-[12px] tracking-[0.16em] text-muted">
                {s.no}
              </div>
              <h3 className="mb-3 font-serif-ph text-[22px] font-semibold leading-[1.04] tracking-[-0.01em]">
                {s.title}
              </h3>
              <p className="m-0 font-serif-ph text-[16.5px] leading-[1.58] text-text-soft">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </Wrap>
    </section>
  );
}
