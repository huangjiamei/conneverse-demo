"use client";

/**
 * 登录表单。成功 → 按服务端算好的 landing 跳转 (平台管理员 /admin,其余 /ro)。
 * 403 + needsEmailVerification → 留在本页,提示先验证邮箱并就地给重发入口 (§C4)。
 * 403 (未批准) → 带 status 跳 /pending。其余错误一律展示服务端那句通用文案。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Field,
  FormError,
  inputClass,
  SubmitButton,
} from "@/components/auth/AuthCard";
import { ResendVerificationForm } from "@/app/verify-email/ResendVerificationForm";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        router.replace(data.redirect ?? "/search");
        router.refresh(); // 让 layout 重新读会话,头部立刻显示用户
        return;
      }
      // 邮箱没验证: 不跳走,就地提示 + 重发按钮 (跳转会丢掉刚填的邮箱)
      if (res.status === 403 && data.needsEmailVerification === true) {
        setNeedsVerification(true);
        setError(data.error ?? "Please verify your email first");
        return;
      }
      // 未批准: 服务端给了 /pending?status=... 的去向
      if (res.status === 403 && typeof data.redirect === "string") {
        router.replace(data.redirect);
        return;
      }
      setError(data.error ?? "Invalid email or password");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <FormError message={error} />}

      {needsVerification && (
        <div className="rounded-lg border border-[#00B4A6]/35 bg-teal-50/60 p-3.5">
          <p className="mb-2.5 text-[13px] leading-relaxed text-[#1A1A2E]">
            We sent a verification link to <strong>{email}</strong>. Click it to
            finish signing up — then your registration goes to the PartHand team
            for review.
          </p>
          <ResendVerificationForm hideEmailInput defaultEmail={email} />
        </div>
      )}

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@shop.com"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="••••••••"
        />
      </Field>

      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
