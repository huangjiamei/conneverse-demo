/** 末尾 CTA —— 居中,深色 + 一道底部径向渐变。 */

import { Wrap, BtnLink } from "./primitives";
import { BookDemoButton } from "./BookDemoButton";

const CTA_BG =
  "radial-gradient(700px 320px at 50% 130%, rgba(120,150,55,.16), transparent 60%)," +
  "var(--color-ink)";

export function Cta() {
  return (
    <section className="py-[104px] text-center text-text-light" style={{ background: CTA_BG }}>
      <Wrap>
        <h2 className="mx-auto max-w-[16ch] font-serif-ph text-[clamp(34px,5vw,58px)] font-semibold leading-[1.04] tracking-[-0.02em] text-[#f6f5ee]">
          Stop pricing parts one tab at a time.
        </h2>
        <p className="mx-auto mb-[34px] mt-[22px] max-w-[40ch] font-serif-ph text-[19px] text-[#bcbdb2]">
          See what PartHand finds on a job you sourced last week.
        </p>
        <div className="flex flex-wrap justify-center gap-3.5">
          <BookDemoButton className="max-smx:flex-1" />
          <BtnLink href="/login" variant="outlineLight" className="max-smx:flex-1">
            Sign in
          </BtnLink>
        </div>
      </Wrap>
    </section>
  );
}
