/** "The longer arc" —— 深色段落,原稿 .arc。 */

import { Wrap, Eyebrow, SECTION_PAD } from "./primitives";

export function Arc() {
  return (
    <section className={`bg-ink text-text-light ${SECTION_PAD}`}>
      <Wrap>
        <div className="grid grid-cols-1 items-start gap-5 mdx:grid-cols-[1.1fr_.9fr] mdx:gap-10">
          <div>
            <Eyebrow tone="dark">The longer arc</Eyebrow>
            <h2 className="mt-5 max-w-[16ch] font-serif-ph text-[clamp(30px,4.2vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em] text-[#f5f4ed]">
              A chain where supply and demand can speak to each other
            </h2>
          </div>
          <p className="max-w-[34em] font-serif-ph text-[18px] leading-[1.6] text-[#c3c4b9]">
            Every search is a demand signal. Aggregated and anonymized, it tells
            manufacturers what shops actually need, where, and when — so supply gets
            planned against real demand instead of guesswork, and the shop buys on
            fair terms.
          </p>
        </div>
      </Wrap>
    </section>
  );
}
