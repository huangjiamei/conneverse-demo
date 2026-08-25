"use client";

/**
 * "Book a demo" 触发按钮 —— 四处都用它 (nav 里的除外,那边样式不同)。
 * 单独成文件是因为它要 onClick,而 Hero / CTA / Footer 都是 server component。
 */

import { Btn, type BtnVariant } from "./primitives";
import { useDemoDialog } from "./DemoDialog";

export function BookDemoButton({
  variant = "green",
  className = "",
  children = "Book a demo",
}: {
  variant?: BtnVariant;
  className?: string;
  children?: React.ReactNode;
}) {
  const { open } = useDemoDialog();
  return (
    <Btn variant={variant} onClick={open} className={className}>
      {children}
    </Btn>
  );
}

/** 页脚那种纯文字链接形态 */
export function BookDemoLink({ className = "" }: { className?: string }) {
  const { open } = useDemoDialog();
  return (
    <button type="button" onClick={open} className={className}>
      Book a demo
    </button>
  );
}
