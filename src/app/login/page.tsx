"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_SHOP_PROFILE,
  useShop,
  type ShopProfile,
} from "@/context/ShopContext";

const REGIONS = [
  "San Francisco Bay Area",
  "Los Angeles",
  "New York / NJ",
  "Chicago",
  "Houston",
  "Phoenix",
  "Seattle",
  "Other",
];

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal transition";

export default function LoginPage() {
  const router = useRouter();
  const { setProfile } = useShop();
  const [form, setForm] = useState<ShopProfile>(DEFAULT_SHOP_PROFILE);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfile(form);
    router.push("/");
  }

  function handleSkip() {
    setProfile(DEFAULT_SHOP_PROFILE);
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] px-4 py-10">
      <div
        className="w-full max-w-[480px] bg-white shadow-lg"
        style={{ padding: 40, borderRadius: 12 }}
      >
        <div className="text-center">
          <div
            className="font-bold tracking-tight text-[#1B2838]"
            style={{ fontSize: 24, lineHeight: 1.1 }}
          >
            Conneverse
          </div>
          <div
            className="text-teal mt-1"
            style={{ fontSize: 13, letterSpacing: 0.2 }}
          >
            Trusted Parts Agent
          </div>
        </div>

        <hr className="my-5 border-teal/40" />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Shop name">
            <input
              type="text"
              required
              value={form.shopName}
              onChange={(e) =>
                setForm((f) => ({ ...f, shopName: e.target.value }))
              }
              className={inputCls}
            />
          </Field>

          <Field label="Address">
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
              className={inputCls}
            />
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              className={inputCls}
            />
          </Field>

          <Field label="Region">
            <select
              value={form.region}
              onChange={(e) =>
                setForm((f) => ({ ...f, region: e.target.value }))
              }
              className={inputCls}
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Labor rate ($/hr)">
            <input
              type="number"
              min={0}
              step={1}
              required
              value={form.laborRate}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  laborRate: Number(e.target.value) || 0,
                }))
              }
              className={inputCls}
            />
          </Field>

          <button
            type="submit"
            className="mt-2 w-full h-11 rounded-lg bg-teal text-white font-medium text-sm hover:bg-teal/90 active:scale-[0.98] transition"
          >
            Get Started &rarr;
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition"
          >
            Skip &mdash; use demo defaults
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
