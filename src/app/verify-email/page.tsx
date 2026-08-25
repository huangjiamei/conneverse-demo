/**
 * /verify-email —— 邮件里那条链接的落地页。公开访问 (拿着链接的人还没法登录)。
 *
 * 令牌在这次渲染里就被兑换掉:哈希 → 查行 → CAS 盖 usedAt → 翻 emailVerified,
 * 全在 consumeEmailVerificationToken 里。因为是 compare-and-set,链接被邮件
 * 扫描器预取过、或者用户点了两次,都只会有一次判为 VERIFIED,所以"验证通过"
 * 的两封通知恰好发一次 (§B 幂等);后续访问走 ALREADY_VERIFIED,照样显示成功,
 * 不拿"链接失效"吓人。
 *
 * 无 token / 过期 / 已用 / 伪造 → 一律给友好文案 + 重发入口 (§C2)。
 */

import Link from "next/link";
import { CircleCheck, MailWarning, MailQuestionMark } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { consumeEmailVerificationToken } from "@/lib/auth/emailVerification";
import { notifyEmailVerified } from "@/lib/email/notify";
import { ResendVerificationForm } from "./ResendVerificationForm";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s : "";
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const token = one(sp.token);
  // 从登录页的"先验证邮箱"提示过来时,把邮箱带过来省一次输入
  const email = one(sp.email);

  if (!token) {
    return (
      <Shell
        tone="ask"
        title="Verify your email"
        body="Enter the address you registered with and we'll send a fresh verification link."
      >
        <ResendVerificationForm
          defaultEmail={email}
          label="Send verification email"
        />
      </Shell>
    );
  }

  const result = await consumeEmailVerificationToken(token);

  if (result.outcome === "VERIFIED") {
    // 先落库、后发信:令牌此刻已作废,这两封通知只会在这一次发出去
    await notifyEmailVerified(result.userId);
  }

  if (result.outcome === "VERIFIED" || result.outcome === "ALREADY_VERIFIED") {
    return (
      <Shell
        tone="ok"
        title="Email verified"
        body="Email verified — your request is now pending review. We'll email you as soon as the PartHand team makes a decision."
      />
    );
  }

  const COPY: Record<"EXPIRED" | "USED" | "INVALID", string> = {
    EXPIRED:
      "That verification link has expired — they're only good for 24 hours. Request a new one below.",
    USED: "That verification link has already been used. Request a new one below.",
    INVALID:
      "We couldn't match that verification link. It may have been cut off in your email client — request a new one below.",
  };

  return (
    <Shell
      tone="bad"
      title="This link didn't work"
      body={COPY[result.outcome]}
    >
      <ResendVerificationForm defaultEmail={email} />
    </Shell>
  );
}

// ---- 三种状态共用的卡片 ----

function Shell({
  tone,
  title,
  body,
  children,
}: {
  tone: "ok" | "bad" | "ask";
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const Icon =
    tone === "ok" ? CircleCheck : tone === "bad" ? MailWarning : MailQuestionMark;
  const iconTone =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "bad"
        ? "bg-red-50 text-red-600"
        : "bg-teal-50 text-[#00B4A6]";

  return (
    <AuthCard
      title={title}
      footer={
        <Link href="/login" className="font-medium text-[#00B4A6] hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconTone}`}
        >
          <Icon size={18} />
        </span>
        <p className="pt-1.5 text-sm leading-relaxed text-gray-600">{body}</p>
      </div>
      {children && <div className="mt-5">{children}</div>}
    </AuthCard>
  );
}
