"use client";

/**
 * "New shop" — inline disclosure form rather than a modal, so it can't trap
 * focus and the list stays visible underneath.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  Field,
  FormError,
  inputClass,
  inputErrorClass,
  SubmitButton,
} from "@/components/auth/AuthCard";

const EMPTY = {
  name: "",
  type: "",
  phone: "",
  addressLine1: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
};

export function CreateShopButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));
  const cls = (k: string) => (fieldErrors[k] ? inputErrorClass : inputClass);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      const res = await fetch("/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setForm(EMPTY);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#00B4A6] px-3.5 py-2 text-[13px]
                   font-semibold text-white hover:bg-[#00A396] transition whitespace-nowrap"
      >
        <Plus size={15} />
        New shop
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-gray-500">
          New shop
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {error && <FormError message={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shop name" htmlFor="new-name" error={fieldErrors.name}>
            <input
              id="new-name"
              required
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              className={cls("name")}
              placeholder="Bay Auto Care"
            />
          </Field>
          <Field label="Type" htmlFor="new-type" error={fieldErrors.type}>
            <select
              id="new-type"
              value={form.type}
              onChange={(e) => set("type")(e.target.value)}
              className={cls("type")}
            >
              <option value="">—</option>
              <option value="MECHANICAL">Mechanical</option>
              <option value="COLLISION">Collision</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="new-phone" error={fieldErrors.phone}>
            <input
              id="new-phone"
              value={form.phone}
              onChange={(e) => set("phone")(e.target.value)}
              className={cls("phone")}
            />
          </Field>
          <Field label="Address" htmlFor="new-addr" error={fieldErrors.addressLine1}>
            <input
              id="new-addr"
              value={form.addressLine1}
              onChange={(e) => set("addressLine1")(e.target.value)}
              className={cls("addressLine1")}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="City" htmlFor="new-city" error={fieldErrors.city}>
              <input
                id="new-city"
                value={form.city}
                onChange={(e) => set("city")(e.target.value)}
                className={cls("city")}
              />
            </Field>
          </div>
          <Field label="State" htmlFor="new-state" error={fieldErrors.state}>
            <input
              id="new-state"
              maxLength={2}
              value={form.state}
              onChange={(e) => set("state")(e.target.value.toUpperCase())}
              className={cls("state")}
              placeholder="CA"
            />
          </Field>
          <Field label="ZIP" htmlFor="new-zip" error={fieldErrors.zip}>
            <input
              id="new-zip"
              value={form.zip}
              onChange={(e) => set("zip")(e.target.value)}
              className={cls("zip")}
            />
          </Field>
        </div>

        <div className="w-40">
          <SubmitButton pending={pending} pendingLabel="Creating…">
            Create shop
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
