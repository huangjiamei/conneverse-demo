import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conneverse — Trusted Parts Agent",
  description:
    "Quality-verified parts with guaranteed fitment, delivery, and returns. One search, every supplier.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#F7F8FA] text-[#1A1A2E]">
        {children}
      </body>
    </html>
  );
}