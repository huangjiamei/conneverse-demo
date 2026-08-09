"use client";

/**
 * Shop info editor. Used by both /shop (shop admin) and /admin/shops/[id]
 * (platform admin) — `canEditName` is the only difference.
 *
 * The disabled name input is a UI affordance, not the control: the server
 * whitelist in lib/shops.ts is what actually stops a shop admin from renaming
 * a shop, and this form never sends `name` unless canEditName is set.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  Field,
  FormError,
  inputClass,
  inputErrorClass,
  SubmitButton,
} from "@/components/auth/AuthCard";

export type ShopInfo = {
  id: string;
  name: string;
  type: "MECHANICAL" | "COLLISION" | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
};

type FieldErrors = Record<string, string>;

export function ShopInfoForm({
  shop,
  canEditName,
}: {
  shop: ShopInfo;
  canEditName: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: shop.name,
    type: shop.type ?? "",
    phone: shop.phone ?? "",
    addressLine1: shop.addressLine1 ?? "",
    addressLine2: shop.addressLine2 ?? "",
    city: shop.city ?? "",
    state: shop.state ?? "",
    zip: shop.zip ?? "",
    country: shop.country ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    setPending(true);

    // 没有改名权限时干脆不发这个字段
    const { name, ...rest } = form;
    const payload = canEditName ? { name, ...rest } : rest;

    try {
      const res = await fetch(`/api/shops/${shop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const cls = (k: string) => (fieldErrors[k] ? inputErrorClass : inputClass);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <FormError message={error} />}

      <Field
        label="Shop name"
        htmlFor="shop-name"
        error={fieldErrors.name}
        hint={
          canEditName
            ? undefined
            : "Only the Conneverse platform team can rename a shop."
        }
      >
        <input
          id="shop-name"
          type="text"
          value={form.name}
          disabled={!canEditName}
          onChange={(e) => set("name")(e.target.value)}
          className={cls("name")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="shop-type" error={fieldErrors.type}>
          <select
            id="shop-type"
            value={form.type}
            onChange={(e) => set("type")(e.target.value)}
            className={cls("type")}
          >
            <option value="">—</option>
            <option value="MECHANICAL">Mechanical</option>
            <option value="COLLISION">Collision</option>
          </select>
        </Field>

        <Field label="Phone" htmlFor="shop-phone" error={fieldErrors.phone}>
          <input
            id="shop-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            className={cls("phone")}
            placeholder="(415) 555-0134"
          />
        </Field>
      </div>

      <Field
        label="Address line 1"
        htmlFor="shop-addr1"
        error={fieldErrors.addressLine1}
      >
        <input
          id="shop-addr1"
          type="text"
          value={form.addressLine1}
          onChange={(e) => set("addressLine1")(e.target.value)}
          className={cls("addressLine1")}
          placeholder="1200 Folsom St"
        />
      </Field>

      <Field
        label="Address line 2"
        htmlFor="shop-addr2"
        error={fieldErrors.addressLine2}
      >
        <input
          id="shop-addr2"
          type="text"
          value={form.addressLine2}
          onChange={(e) => set("addressLine2")(e.target.value)}
          className={cls("addressLine2")}
          placeholder="Unit B"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="City" htmlFor="shop-city" error={fieldErrors.city}>
            <input
              id="shop-city"
              type="text"
              value={form.city}
              onChange={(e) => set("city")(e.target.value)}
              className={cls("city")}
            />
          </Field>
        </div>
        <Field label="State" htmlFor="shop-state" error={fieldErrors.state}>
          <input
            id="shop-state"
            type="text"
            maxLength={2}
            value={form.state}
            onChange={(e) => set("state")(e.target.value.toUpperCase())}
            className={cls("state")}
            placeholder="CA"
          />
        </Field>
        <Field label="ZIP" htmlFor="shop-zip" error={fieldErrors.zip}>
          <input
            id="shop-zip"
            type="text"
            value={form.zip}
            onChange={(e) => set("zip")(e.target.value)}
            className={cls("zip")}
            placeholder="94103"
          />
        </Field>
      </div>

      <div className="sm:w-1/4">
        <Field
          label="Country"
          htmlFor="shop-country"
          error={fieldErrors.country}
        >
          <input
            id="shop-country"
            type="text"
            maxLength={2}
            value={form.country}
            onChange={(e) => set("country")(e.target.value.toUpperCase())}
            className={cls("country")}
            placeholder="US"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <div className="w-40">
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save changes
          </SubmitButton>
        </div>
        {saved && (
          <p className="inline-flex items-center gap-1 text-[13px] text-emerald-600">
            <Check size={14} />
            Saved
          </p>
        )}
      </div>
    </form>
  );
}
