import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Conneverse — Trusted Parts Agent",
  description:
    "Quality-verified parts with guaranteed fitment, delivery, and returns.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning: browser extensions (wallets, Grammarly,
  // dark-mode tools) inject attributes onto <html> before React hydrates.
  // Suppresses one level only — mismatches inside the tree still surface.
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[#F7F8FA] text-[#1A1A2E]">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}