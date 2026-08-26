"use client";

/**
 * 顶部导航 —— sticky,深色半透明 + 背景模糊。
 * 原稿 ≤960px 时直接把中间的链接组藏掉 (.nav-links{display:none}),并留了个
 * .nav-toggle 按钮位。这里把那个按钮真正实现成下拉抽屉,不然窄屏就没导航了。
 */

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Wrap, Btn } from "./primitives";
import { useDemoDialog } from "./DemoDialog";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#product", label: "Product" },
  { href: "#integrations", label: "Integrations" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const { open } = useDemoDialog();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line-dark bg-ink/[.86] backdrop-blur-[10px] backdrop-saturate-[1.4]">
      <Wrap className="flex h-16 items-center gap-6">
        <Link
          href="/home"
          className="text-[22px] font-bold tracking-[-0.02em] text-text-light"
        >
          PartHand
        </Link>

        {/* ≥961px 才出现,和原稿 .nav-links 的断点一致 */}
        <nav className="mx-auto hidden gap-[34px] mdx:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[16px] text-text-light-soft transition-colors hover:text-text-light"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 mdx:ml-0 mdx:gap-[18px]">
          {/* 原稿 .nav-right 在任何宽度都留着这两个,只有中间的 .nav-links 会收起 */}
          <Link
            href="/login"
            className="text-[15px] text-text-light-soft transition-colors hover:text-text-light mdx:text-[16px]"
          >
            Sign in
          </Link>
          <Btn
            variant="light"
            onClick={open}
            className="!px-4 !py-[6px] text-[14px] mdx:!px-5 mdx:text-[15px]"
          >
            Book a demo
          </Btn>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="p-1 text-text-light mdx:hidden"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </Wrap>

      {menuOpen && (
        <div className="border-t border-line-dark bg-ink mdx:hidden">
          <Wrap className="flex flex-col gap-1 py-4">
            {/* 抽屉里只放收起来的那组 section 链接;Sign in / Book a demo 一直在栏上 */}
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="py-2.5 text-[17px] text-text-light-soft transition-colors hover:text-text-light"
              >
                {l.label}
              </a>
            ))}
          </Wrap>
        </div>
      )}
    </header>
  );
}
