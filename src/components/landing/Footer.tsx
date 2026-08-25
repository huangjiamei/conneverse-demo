/** 页脚 —— 四列 → ≤960 两列 → ≤560 单列。 */

import Link from "next/link";
import { Wrap } from "./primitives";
import { BookDemoLink } from "./BookDemoButton";

const COL_LINK =
  "mb-[11px] block text-[16px] text-[#cfd0c5] transition-colors hover:text-white";

function ColHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-4 font-mono-ph text-[11.5px] font-normal uppercase tracking-[0.16em] text-muted-dark">
      {children}
    </h4>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line-dark bg-ink pb-[34px] pt-[70px] text-text-light">
      <Wrap>
        <div className="grid grid-cols-1 gap-8 smx:grid-cols-2 mdx:grid-cols-[1.4fr_.6fr_.6fr_.8fr] mdx:gap-9">
          <div>
            <Link
              href="/home"
              className="mb-4 block text-[22px] font-bold tracking-[-0.02em] text-text-light"
            >
              PartHand
            </Link>
            <p className="m-0 max-w-[30em] font-serif-ph text-[16px] text-[#a9aa9f]">
              A procurement layer for repair shops. Quality-verified parts with
              guaranteed fitment, delivery, and returns.
            </p>
          </div>

          <div>
            <ColHeading>Product</ColHeading>
            <a href="#how" className={COL_LINK}>
              How it works
            </a>
            <a href="#product" className={COL_LINK}>
              Inside PartHand
            </a>
            <a href="#integrations" className={COL_LINK}>
              Integrations
            </a>
          </div>

          <div>
            <ColHeading>Company</ColHeading>
            <a href="#" className={COL_LINK}>
              About
            </a>
            <a href="#faq" className={COL_LINK}>
              FAQ
            </a>
            <a href="#" className={COL_LINK}>
              Contact
            </a>
          </div>

          <div>
            <ColHeading>Get started</ColHeading>
            <BookDemoLink className={`${COL_LINK} text-left`} />
            <Link href="/login" className={COL_LINK}>
              Sign in
            </Link>
            <Link href="/register" className={COL_LINK}>
              Create an account
            </Link>
          </div>
        </div>

        <div className="mt-13 flex flex-col items-start gap-3.5 border-t border-line-dark pt-[22px] font-mono-ph text-[12px] uppercase tracking-[0.1em] text-muted-dark smx:flex-row smx:items-center smx:justify-between smx:gap-0">
          <span>PartHand © 2026</span>
          <span className="flex gap-7">
            <a href="#" className="transition-colors hover:text-[#e6e6dc]">
              Privacy
            </a>
            <a href="#" className="transition-colors hover:text-[#e6e6dc]">
              Terms
            </a>
          </span>
        </div>
      </Wrap>
    </footer>
  );
}
