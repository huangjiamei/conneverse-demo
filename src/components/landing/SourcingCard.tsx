/**
 * Hero 右侧那张"正在比价"的卡片 —— 纯 CSS,没有图片。
 * 内容全是蓝本里的静态示例数据,aria-hidden:它是插画,不是可读内容。
 */

const OPTIONS = [
  {
    title: "OEM · dealer network",
    sub: "New · Fitment verified",
    price: "$412.90",
    eta: "Arrives Tue",
    highlight: true,
  },
  {
    title: "Aftermarket · CAPA certified",
    sub: "New · Fitment verified",
    price: "$188.00",
    eta: "Arrives Wed",
    highlight: false,
  },
  {
    title: "Recycled · grade A",
    sub: "Used · Photo verified",
    price: "$141.50",
    eta: "Arrives Thu",
    highlight: false,
  },
];

const LABEL = "font-mono-ph text-[11px] uppercase tracking-[0.1em] mt-1.5";

export function SourcingCard() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[16px] border border-line-dark bg-card-dark p-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,.7)]"
    >
      <div className="flex items-center gap-2.5 px-1.5 pb-4 pt-1.5 font-mono-ph text-[11.5px] uppercase tracking-[0.14em] text-muted-dark">
        <span className="flex gap-[5px]">
          <i className="block h-2 w-2 rounded-full bg-[#3a3d33]" />
          <i className="block h-2 w-2 rounded-full bg-[#3a3d33]" />
        </span>
        Sourcing · RO 48213
      </div>

      <div className="mb-3 flex items-center gap-2.5 rounded-[10px] border border-line-dark bg-[#12130d] px-3.5 py-[13px] font-mono-ph text-[13.5px] text-[#d7d8cd]">
        <span className="text-leaf-on-dark">›</span>
        2019 Toyota RAV4 LE — front bumper cover
      </div>

      {OPTIONS.map((o) => (
        <div
          key={o.title}
          className={`mb-2.5 flex items-start justify-between gap-3.5 rounded-[10px] border px-[15px] py-3.5 ${
            o.highlight
              ? "border-[rgba(140,170,70,.5)] bg-[linear-gradient(0deg,rgba(120,150,55,.08),rgba(120,150,55,.08)),#141710] shadow-[inset_3px_0_0_var(--color-leaf)]"
              : "border-line-dark bg-[#12130c]"
          }`}
        >
          <div>
            <div className="font-serif-ph text-[15px] font-medium text-[#eef0e6]">
              {o.title}
            </div>
            <div className={`${LABEL} text-muted-dark`}>{o.sub}</div>
          </div>
          <div className="flex-none text-right">
            <div className="font-serif-ph text-[15px] font-semibold text-[#eef0e6]">
              {o.price}
            </div>
            <div
              className={`${LABEL} ${o.highlight ? "text-leaf-on-dark" : "text-muted-dark"}`}
            >
              {o.eta}
            </div>
          </div>
        </div>
      ))}

      <div className="flex justify-between px-1.5 pb-1 pt-2 font-mono-ph text-[11px] uppercase tracking-[0.12em] text-muted-dark">
        <span>14 channels searched</span>
        <span>Returns covered</span>
      </div>
    </div>
  );
}
