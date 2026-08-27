/**
 * Inside PartHand —— 左文右清单,底下三块真实截图。
 * 大框:sourcing board;左下:part search;右下:order tracking。
 */

import Image from "next/image";

import { Wrap, Eyebrow, SECTION_PAD } from "./primitives";

const CHECKS = [
  "Side-by-side options with landed cost",
  "Fitment confidence on every line",
  "Return status tracked to credit",
];

/** 真实截图 —— 白底衬托,object-contain 不裁切、按原比例自适应高度 */
function Screenshot({
  src,
  alt,
  width,
  height,
  sizes,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
}) {
  return (
    <div className="overflow-hidden rounded-[12px] bg-white">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className="h-auto w-full object-contain"
      />
    </div>
  );
}

/** 原稿 .shot —— 占位框外面那层白卡 */
function Shot({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[18px] border border-line bg-white p-3.5 shadow-[0_26px_50px_-34px_rgba(0,0,0,.35)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Product() {
  return (
    <section id="product" className={SECTION_PAD}>
      <Wrap>
        <div className="grid grid-cols-1 items-start gap-6 mdx:grid-cols-[1.15fr_.85fr] mdx:gap-10">
          <div>
            <Eyebrow>Inside PartHand</Eyebrow>
            <h2 className="mb-[22px] mt-5 max-w-[18ch] font-serif-ph text-[clamp(30px,4.2vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">
              Built for the person holding twelve tabs open
            </h2>
            <p className="max-w-[34em] font-serif-ph text-[18px] leading-[1.6] text-text-soft">
              Sourcing, approvals, order tracking, and returns live on one board.
              Every order updates in real time — so you&apos;re not calling suppliers
              for status, and a delay shows up the moment it happens, not when the
              car&apos;s already on the lift.
            </p>
          </div>
          <div className="flex flex-col gap-4 pt-2">
            {CHECKS.map((c) => (
              <div
                key={c}
                className="flex items-baseline gap-3.5 font-serif-ph text-[17.5px] text-[#26271f]"
              >
                <span className="font-mono-ph font-bold text-leaf-deep">/</span>
                {c}
              </div>
            ))}
          </div>
        </div>

        <Shot className="mt-11">
          <Screenshot
            src="/marketing/sourcingboard.png"
            alt="Every option, ranked side by side"
            width={1239}
            height={869}
            sizes="(max-width: 980px) 100vw, 1100px"
          />
        </Shot>

        <div className="mt-7 grid grid-cols-1 items-start gap-7 mdx:grid-cols-2">
          <Shot>
            <Screenshot
              src="/marketing/partsearch.png"
              alt="Search by vehicle and part"
              width={1258}
              height={639}
              sizes="(max-width: 980px) 100vw, 50vw"
            />
          </Shot>
          <Shot>
            <Screenshot
              src="/marketing/ordertracking.png"
              alt="Order and delivery tracking"
              width={1230}
              height={351}
              sizes="(max-width: 980px) 100vw, 50vw"
            />
          </Shot>
        </div>
      </Wrap>
    </section>
  );
}
