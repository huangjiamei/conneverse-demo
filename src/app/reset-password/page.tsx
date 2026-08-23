/**
 * /reset-password?token=... —— 邮件里那条重置链接的落地页。公开访问。
 *
 * 这里只【只读】校验令牌,不消费它:用户还没填新密码,现在作废等于让他白跑一趟。
 * 真正的消费在 POST /api/auth/reset-password,那边会重新校验一次 —— 本页的判断
 * 只决定"要不要显示表单",不是授权。顺带也就不怕邮件扫描器预取链接了。
 *
 * 无 token / 过期 / 已用 / 伪造 → 友好提示 + 回 /forgot-password 重新申请。
 */

import Link from "next/link";
import { KeyRound, MailWarning } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { checkPasswordResetToken } from "@/lib/auth/passwordReset";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Choose a new password — PartHand" };

const FAILURE_COPY = {
  EXPIRED:
    "That reset link has expired — they're only good for an hour. Request a fresh one and we'll email it right over.",
  USED: "That reset link has already been used. If you still need to change your password, request a new link.",
  INVALID:
    "We couldn't match that reset link. It may have been cut off in your email client — request a new one.",
} as const;

function one(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s : "";
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const token = one(sp.token);

  const state = token ? await checkPasswordResetToken(token) : "INVALID";

  if (state !== "VALID") {
    return (
      <AuthCard
        title="This link didn't work"
        footer={
          <Link href="/" className="font-medium text-[#00B4A6] hover:underline">
            ← Back to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <MailWarning size={18} />
          </span>
          <p className="pt-1.5 text-sm leading-relaxed text-gray-600">
            {FAILURE_COPY[state]}
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-[#00B4A6]
                     px-3 py-2 text-[13px] font-semibold text-[#00B4A6] transition hover:bg-teal-50"
        >
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Pick something you haven't used elsewhere."
      footer={
        <Link href="/" className="font-medium text-[#00B4A6] hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#00B4A6]">
          <KeyRound size={18} />
        </span>
        <p className="pt-1.5 text-sm leading-relaxed text-gray-600">
          This link is valid. Set your new password below.
        </p>
      </div>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
