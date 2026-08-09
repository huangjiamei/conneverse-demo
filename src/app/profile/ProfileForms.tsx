"use client";

/**
 * Profile forms — rename, and change password. Two independent submits so a
 * failed password change doesn't discard a name edit.
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
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

type FieldErrors = Record<string, string>;

function Saved({ show, children }: { show: boolean; children: string }) {
  if (!show) return null;
  return (
    <p className="inline-flex items-center gap-1 text-[13px] text-emerald-600">
      <Check size={14} />
      {children}
    </p>
  );
}

export function NameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    setPending(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaved(true);
      router.refresh(); // 头部立刻显示新名字
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <FormError message={error} />}
      <Field label="Name" htmlFor="profile-name" error={fieldErrors.name}>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className={fieldErrors.name ? inputErrorClass : inputClass}
        />
      </Field>
      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save name
          </SubmitButton>
        </div>
        <Saved show={saved}>Saved</Saved>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (newPassword !== confirm) {
      setFieldErrors({ confirm: "Passwords do not match." });
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaved(true);
      setCurrent("");
      setNew("");
      setConfirm("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <FormError message={error} />}

      <Field
        label="Current password"
        htmlFor="current-password"
        error={fieldErrors.currentPassword}
      >
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          className={fieldErrors.currentPassword ? inputErrorClass : inputClass}
        />
      </Field>

      <Field
        label="New password"
        htmlFor="new-password"
        error={fieldErrors.newPassword}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      >
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          className={fieldErrors.newPassword ? inputErrorClass : inputClass}
        />
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirm-password"
        error={fieldErrors.confirm}
      >
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={fieldErrors.confirm ? inputErrorClass : inputClass}
        />
      </Field>

      <div className="flex items-center gap-3">
        <div className="w-48">
          <SubmitButton pending={pending} pendingLabel="Updating…">
            Change password
          </SubmitButton>
        </div>
        <Saved show={saved}>Password updated</Saved>
      </div>
    </form>
  );
}
