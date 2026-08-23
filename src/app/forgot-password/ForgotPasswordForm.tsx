"use client";

/**
 * 忘记密码表单。
 *
 * 服务端的回答永远中性 (不说邮箱存不存在),所以成功一律显示同一句话。
 * 只有 429 会带 retryAfterSec —— 那时按钮自己倒计时,免得用户对着冷却反复点。
 *
 * 和 ResendVerificationForm 一样刻意不用 <form>:免得哪天被嵌进别的表单里,
 * 浏览器丢掉内层 form、按钮变成外层的 submit (踩过一次了)。
 */

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Field, FormError, inputClass } from "@/components/auth/AuthCard";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    if (pending || cooldown > 0 || !email.trim()) return;
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        retryAfterSec?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not send the email. Please try again.");
        if (typeof data.retryAfterSec === "number") setCooldown(data.retryAfterSec);
        return;
      }
      setNotice(data.message ?? "Check your inbox for a reset link.");
      setCooldown(60); // 和服务端 FORGOT_COOLDOWN_SEC 对齐
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <FormError message={error} />}

      <Field
        label="Email"
        htmlFor="email"
        hint="We'll send a link that lets you choose a new password."
      >
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          // 没有 <form> 就没有隐式提交,回车得自己接
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          className={inputClass}
          placeholder="you@shop.com"
        />
      </Field>

      <button
        type="button"
        onClick={() => void send()}
        disabled={pending || cooldown > 0 || !email.trim()}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#00B4A6]
                   py-2.5 text-sm font-semibold text-white transition hover:bg-[#00A396]
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        {cooldown > 0 ? `Resend in ${cooldown}s` : "Send reset link"}
      </button>

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] leading-relaxed text-emerald-800"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
