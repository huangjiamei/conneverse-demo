"use client";

/**
 * Standalone-app shell: composes the providers, the embeddable
 * SourcingPanel, and the quote builder. All sourcing/quote state lives
 * in SourcingContext; all UI lives in components.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useShop } from "@/context/ShopContext";
import { SourcingProvider } from "@/context/SourcingContext";
import { AppHeader } from "@/components/AppHeader";
import { DemoBanner } from "@/components/DemoBanner";
import { SourcingPanel } from "@/components/sourcing/SourcingPanel";
import { MobileQuoteBar, QuoteCart } from "@/components/quote/QuoteCart";

export default function Home() {
  const router = useRouter();
  const { profile, isLoaded } = useShop();

  useEffect(() => {
    if (isLoaded && !profile) {
      router.replace("/login");
    }
  }, [isLoaded, profile, router]);

  if (!isLoaded || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <SourcingProvider>
      <div className="min-h-screen flex flex-col">
        <DemoBanner />
        <AppHeader />

        <div className="flex-1 flex justify-center">
          <div className="flex w-full max-w-[1200px] px-4 sm:px-6 py-6 gap-6">
            <SourcingPanel />
            <QuoteCart />
          </div>
        </div>

        <MobileQuoteBar />
      </div>
    </SourcingProvider>
  );
}
