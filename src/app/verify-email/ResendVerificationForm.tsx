"use client";

/**
 * 「重发验证邮件」——验证页失败态和登录页的验证拦截共用一个组件。
 *
 * 服务端的回答永远中性 (不说邮箱存不存在),所以这里成功一律显示同一句话。
 * 只有 429 会带 retryAfterSec —— 那时按钮自己倒计时,免得用户对着冷却反复点。
 *
 * 刻意不用 <form>:登录页要把它嵌在自己的 <form> 里,而 HTML 不允许 form 嵌套
 * —— 浏览器解析时会把内层那个直接丢掉,于是"重发"按钮变成外层登录表单的
 * submit,点下去打的是 /api/auth/login 而不是重发接口 (真踩过)。改成
 * div + type="button",再自己接一下回车键,三处用法 (登录 / 待审核 / 验证页)
 * 就都不会再有这个问题。button 上的 type="button" 同样是必需的:
 * <button> 在 form 里默认就是 submit。
 */

import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { inputClass } from "@/components/auth/AuthCard";

export function ResendVerificationForm({
  defaultEmail = "",
  /** 登录页里邮箱已经填过了,不用再要一次 */
  hideEmailInput = false,
  label = "Resend verification email",
}: {
  defaultEmail?: string;
  hideEmailInput?: boolean;
  label?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 登录页把邮箱当 prop 传进来,用户改输入框时要跟上
  useEffect(() => {
    if (hideEmailInput) setEmail(defaultEmail);
  }, [hideEmailInput, defaultEmail]);

  async function send() {
    if (pending || cooldown > 0 || !email.trim()) return;
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
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
        if (typeof data.retryAfterSec === "number") {
          setCooldown(data.retryAfterSec);
        }
        return;
      }
      setNotice(data.message ?? "Check your inbox for a new link.");
      setCooldown(60); // 和服务端 RESEND_COOLDOWN_SEC 对齐
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const disabled = pending || cooldown > 0 || !email.trim();

  return (
    <div className="space-y-2.5">
      {!hideEmailInput && (
        <input
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
          aria-label="Email address"
        />
      )}

      <button
        type="button"
        onClick={() => void send()}
        disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border
                   border-[#00B4A6] px-3 py-2 text-[13px] font-semibold text-[#00B4A6]
                   transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <MailCheck size={14} />
        )}
        {cooldown > 0 ? `Resend in ${cooldown}s` : label}
      </button>

      {notice && (
        <p role="status" className="text-xs leading-relaxed text-emerald-700">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs leading-relaxed text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
