"use client";

/** Sticky navy app header with shop identity and settings link. */

import Link from "next/link";
import { MapPin, Settings } from "lucide-react";
import { useShop } from "@/context/ShopContext";

export function AppHeader() {
  const { profile } = useShop();

  return (
    <header className="sticky top-0 z-50 bg-[#1B2838] text-white shadow-lg">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div>
          <span className="text-lg sm:text-xl font-bold tracking-tight">
            Conneverse
          </span>
          <span className="block text-[12px] text-teal -mt-0.5 tracking-wide">
            {profile?.shopName}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-3 text-[13px]">
            <Link
              href="/orders"
              className="text-gray-300 hover:text-white transition"
            >
              Orders
            </Link>
            <Link
              href="/analytics"
              className="text-gray-300 hover:text-white transition"
            >
              Savings
            </Link>
          </nav>
          <div className="hidden sm:flex items-center gap-1.5 text-gray-400 text-sm">
            <MapPin size={14} />
            <span>{profile?.region}</span>
          </div>
          <Link
            href="/login"
            aria-label="Edit shop settings"
            className="text-gray-400 hover:text-white transition"
          >
            <Settings size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
}
