import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { newsreader, spaceMono } from "@/lib/fonts";
import { getLiveSession } from "@/lib/auth/liveSession";
import { isChromeless, PATHNAME_HEADER } from "@/lib/auth/routes";

export const metadata: Metadata = {
  title: "PartHand — Trusted Parts Agent",
  description:
    "Quality-verified parts with guaranteed fitment, delivery, and returns.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 头部要显示当前用户 / 退出按钮 + 按角色给导航,所以 layout 读会话。
  // 用 live 版 (多一次主键查询): 角色变了要立刻反映在导航上 —— 刚被
  // REPLACE 顶掉的人不该还看得见 Team 入口。
  const session = await getLiveSession();

  // 落地页自带整套深色导航 —— 再挂一条 navy app bar 会变成两条头。
  // pathname 由 proxy.ts 通过请求头带进来 (layout 拿不到路由信息)。
  const pathname = (await headers()).get(PATHNAME_HEADER);
  const chromeless = isChromeless(pathname);

  // suppressHydrationWarning: browser extensions (wallets, Grammarly,
  // dark-mode tools) inject attributes onto <html> before React hydrates.
  // Suppresses one level only — mismatches inside the tree still surface.
  return (
    <html
      lang="en"
      className={`h-full antialiased ${newsreader.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-[#F7F8FA] text-[#1A1A2E]">
        {!chromeless && <AppHeader session={session} />}
        {children}
      </body>
    </html>
  );
}