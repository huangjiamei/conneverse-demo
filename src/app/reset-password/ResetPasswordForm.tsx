"use client";

/**
 * 设新密码表单。只有服务端先判过令牌有效才会渲染到它。
 *
 * 提交时把明文 token 一起发回去,服务端【重新】校验一次 —— 页面那次只读校验
 * 只是决定要不要显示表单,不能当授权用 (中间可能过了很久,链接也可能已被用掉)。
 *
 * 成功后不自动登录:让用户回登录页正常登录,emailVerified / status 两道守卫
 * 才会照常生效,重置密码不构成绕过。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import {
  Field,
  FormError,
  inputClass,
  inputErrorClass,
  SubmitButton,
} from "@/components/auth/AuthCard";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // 确认框只在前端校验 —— 服务端只收一个 password
    if (password !== confirm) {
      setFieldError({ confirm: "Passwords do not match." });
      return;
    }
    setFieldError({});
    setPending(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fieldErrors?: { password?: string };
      };
      if (!res.ok) {
        if (data.fieldErrors?.password) setFieldError({ password: data.fieldErrors.password });
        setError(data.error ?? "Could not reset your password.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CircleCheck size={18} />
          </span>
          <p className="pt-1.5 text-sm leading-relaxed text-gray-600">
            Your password has been reset. Sign in with your new password.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="w-full rounded-lg bg-[#00B4A6] py-2.5 text-sm font-semibold text-white transition hover:bg-[#00A396]"
        >
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <FormError message={error} />}

      <Field
        label="New password"
        htmlFor="password"
        error={fieldError.password}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      >
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldError.password ? inputErrorClass : inputClass}
          placeholder="••••••••"
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirm" error={fieldError.confirm}>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={fieldError.confirm ? inputErrorClass : inputClass}
          placeholder="••••••••"
        />
      </Field>

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Set new password
      </SubmitButton>

      {/* 提交时才知道链接刚好过期/被用掉,给条退路 */}
      <p className="text-center text-xs text-gray-400">
        Link stopped working?{" "}
        <Link href="/forgot-password" className="font-medium text-[#00B4A6] hover:underline">
          Request a new one
        </Link>
      </p>
    </form>
  );
}
