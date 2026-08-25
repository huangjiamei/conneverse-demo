/**
 * Integrations —— 路线图呈现,不是"已集成"。
 *
 * 四张卡各带一个 Coming soon 标签:在真正接通之前,把它们摆成既成事实会让
 * 来看的人按"现在就能用"去理解。标签刻意做小、只描边不填色,说明状态但不抢
 * 标题的视线。
 *
 * 也刻意不放第三方 logo —— 没有合作关系就摆别人的商标,是在暗示一种并不存在
 * 的背书。先用纯文字标题,等真谈成了再补图。
 *
 * 栅格:手机单列 → 平板 2×2 (smx) → 桌面一行 4 张 (mdx)。圆角/描边/间距沿用
 * 页面其它区块 (rounded-[14px] / border-line / gap-5)。
 */

import { Wrap, Eyebrow, SECTION_PAD } from "./primitives";

type Card = {
  title: string;
  sub: string;
  tone: "light" | "dark";
};

const CARDS: Card[] = [
  { title: "Shopmonkey", sub: "Shop management · jobs & status sync", tone: "light" },
  { title: "Tekmetric", sub: "Shop management · live work orders", tone: "light" },
  { title: "CCC ONE", sub: "Collision estimating · line items in", tone: "light" },
  { title: "PartHand API", sub: "Build your own flow", tone: "dark" },
];

/** 小标签 —— 只描边不填色。深色卡上用浅描边,浅色卡上用灰描边,形状一致。 */
function ComingSoon({ tone }: { tone: "light" | "dark" }) {
  return (
    <span
      className={`inline-flex flex-none items-center rounded-full border px-2.5 py-1 font-mono-ph text-[10px] uppercase leading-none tracking-[0.12em] ${
        tone === "dark"
          ? "border-[#3f4238] text-[#a9aa9f]"
          : "border-[#cfd0c6] text-muted"
      }`}
    >
      Coming soon
    </span>
  );
}

function IntegrationCard({ title, sub, tone }: Card) {
  const isDark = tone === "dark";
  return (
    <div
      className={`flex min-h-[200px] flex-col rounded-[14px] border px-[22px] pb-[26px] pt-[22px] ${
        isDark
          ? "border-ink bg-ink text-text-light"
          : "border-line bg-paper-2"
      }`}
    >
      {/* 顶行:深色卡左边留着 REST 绿字,浅色卡只有右侧标签 */}
      <div className="mb-auto flex items-start justify-between gap-3">
        {isDark ? (
          <span className="font-mono-ph text-[12px] uppercase tracking-[0.14em] text-leaf-on-dark">
            REST
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        <ComingSoon tone={tone} />
      </div>

      <h3
        className={`mb-2 mt-[26px] font-serif-ph text-[19px] font-semibold leading-[1.04] tracking-[-0.01em] ${
          isDark ? "text-[#f4f3ec]" : ""
        }`}
      >
        {title}
      </h3>
      <p
        className={`m-0 font-mono-ph text-[13px] leading-[1.5] ${
          isDark ? "text-[#a9aa9f]" : "text-text-soft"
        }`}
      >
        {sub}
      </p>
    </div>
  );
}

export function Integrations() {
  return (
    <section id="integrations" className={`border-t border-line ${SECTION_PAD}`}>
      <Wrap>
        <div className="grid grid-cols-1 items-start gap-5 mdx:grid-cols-[1.1fr_.9fr] mdx:items-end mdx:gap-10">
          <div>
            <Eyebrow>Integrations</Eyebrow>
            <h2 className="mt-5 max-w-[16ch] font-serif-ph text-[clamp(30px,4.2vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">
              Fits the systems your shop already runs on
            </h2>
          </div>
          <p className="max-w-[34em] font-serif-ph text-[18px] leading-[1.6] text-text-soft">
            PartHand is built to fit the systems your shop already runs on.
            Integrations with leading shop-management and estimating tools are
            rolling out — and anything else can be wired through our API.
          </p>
        </div>

        <div className="mt-13 grid grid-cols-1 gap-5 smx:grid-cols-2 mdx:grid-cols-4">
          {CARDS.map((c) => (
            <IntegrationCard key={c.title} {...c} />
          ))}
        </div>
      </Wrap>
    </section>
  );
}
