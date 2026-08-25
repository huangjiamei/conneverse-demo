/**
 * 落地页的三个基础件 —— Wrap / Eyebrow / Btn。
 *
 * 对应蓝本 docs/index.html 里的 .wrap / .eyebrow / .btn。抽出来是因为这三样
 * 在十个 section 里反复出现,内联会让每个组件都背着一串同样的类名。
 *
 * 断点约定:原稿是 desktop-first (max-width:960/560 覆盖),Tailwind 是
 * mobile-first,所以这里一律反过来写 —— 基础类 = 窄屏,mdx:/smx: = 宽屏。
 */

import Link from "next/link";

/** .wrap —— 1200px 居中,窄屏 24px / 宽屏 40px 内边距 */
export function Wrap({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1200px] px-6 mdx:px-10 ${className}`}>
      {children}
    </div>
  );
}

/**
 * .eyebrow —— 等宽小标签。
 * @param tone 深色区块上要用更暗的灰 (原稿 .dark/.hero/.arc .eyebrow 那条规则)
 * @param dot 前面那颗绿点,原稿只有 hero 用
 */
export function Eyebrow({
  children,
  tone = "light",
  dot = false,
  className = "",
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
  dot?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`font-mono-ph text-[12px] font-normal uppercase tracking-[0.18em] ${
        tone === "dark" ? "text-muted-dark" : "text-muted"
      } ${className}`}
    >
      {dot && <span className="mr-[0.5em] text-leaf">●</span>}
      {children}
    </div>
  );
}

const BTN_BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded-full border " +
  "border-transparent px-[26px] py-[14px] font-serif-ph text-[17px] font-semibold " +
  "transition-[transform,background-color,border-color] duration-150 active:translate-y-px";

const BTN_VARIANT = {
  green: "bg-leaf text-[#14170a] hover:bg-[#b2df6d]",
  outlineLight:
    "border-[#3a3c33] bg-transparent text-text-light hover:border-[#565a4d] hover:bg-white/5",
  light: "bg-paper text-[#191a14] hover:bg-white",
} as const;

export type BtnVariant = keyof typeof BTN_VARIANT;

/** 站内锚点/路由跳转用的按钮 */
export function BtnLink({
  href,
  variant = "green",
  className = "",
  children,
}: {
  href: string;
  variant?: BtnVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/** 触发动作 (打开 demo 弹窗) 用的按钮 */
export function Btn({
  variant = "green",
  className = "",
  children,
  ...rest
}: {
  variant?: BtnVariant;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** section.pad —— 窄屏 64px / 宽屏 88px 上下留白 */
export const SECTION_PAD = "py-16 mdx:py-[88px]";
