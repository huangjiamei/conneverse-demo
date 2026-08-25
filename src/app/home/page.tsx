/**
 * /home —— PartHand 市场落地页。
 *
 * 视觉蓝本是 docs/index.html,这里按 Tailwind v4 重写而不是内嵌那段 HTML:
 * 颜色/圆角/断点作为 token 进了 globals.css 的 @theme,字体走 next/font/google。
 *
 * 这一页不挂 app 的 navy AppHeader —— 它自带整套深色导航。抑制逻辑在
 * root layout,靠 proxy 透传的 x-pathname 判断 (见 lib/auth/routes 的 isChromeless)。
 *
 * 本批只做静态页 + Book a demo 发信,别的后端一律不接。
 */

import type { Metadata } from "next";
import { DemoDialogProvider } from "@/components/landing/DemoDialog";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Stats } from "@/components/landing/Stats";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Product } from "@/components/landing/Product";
import { Integrations } from "@/components/landing/Integrations";
import { Arc } from "@/components/landing/Arc";
import { Faq } from "@/components/landing/Faq";
import { Cta } from "@/components/landing/Cta";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "PartHand — Procurement layer for repair shops",
  description:
    "PartHand pulls every parts channel into one search, checks fitment and quality before you commit, and puts the right options in front of your shop in a fraction of the time.",
};

export default function HomePage() {
  return (
    // 落地页整体是 paper 底 + 衬线正文,和 app 的 body 样式不同,所以在这里兜住
    <div className="min-h-screen bg-paper font-serif-ph text-[17px] leading-[1.55] text-text-ink">
      <DemoDialogProvider>
        <Nav />
        <main>
          <Hero />
          <Stats />
          <HowItWorks />
          <Product />
          <Integrations />
          <Arc />
          <Faq />
          <Cta />
        </main>
        <Footer />
      </DemoDialogProvider>
    </div>
  );
}
