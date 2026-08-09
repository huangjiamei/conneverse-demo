/**
 * /pending —— 已注册但进不了应用时的落地页。
 *
 * 采用 §5 方案 A: 未批准的用户从来拿不到会话,所以这页是公开的、无状态的,
 * 靠 query 参数决定文案 (?status=PENDING|REJECTED|DISABLED&claim=1)。
 * 参数是纯展示用的,伪造它也只是看到另一段说明文字,不泄露任何东西。
 */

import Link from "next/link";
import { Clock, ShieldAlert, XCircle } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import type { AccountStatus } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

const COPY: Record<
  AccountStatus,
  { title: string; body: string; tone: "wait" | "bad" }
> = {
  PENDING: {
    title: "Awaiting approval",
    body: "Your registration is awaiting approval. You'll be able to sign in once your shop admin approves your account.",
    tone: "wait",
  },
  APPROVED: {
    title: "You're approved",
    body: "Your account is active. Sign in to continue.",
    tone: "wait",
  },
  REJECTED: {
    title: "Registration not approved",
    body: "Your registration was not approved. Contact your shop admin or the Conneverse platform team if you think this is a mistake.",
    tone: "bad",
  },
  DISABLED: {
    title: "Account disabled",
    body: "Your account is disabled. Contact your shop admin or the Conneverse platform team to restore access.",
    tone: "bad",
  },
};

function parseStatus(raw: string | string[] | undefined): AccountStatus {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "REJECTED" || v === "DISABLED" || v === "APPROVED") return v;
  return "PENDING";
}

export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const claimFiled = (Array.isArray(sp.claim) ? sp.claim[0] : sp.claim) === "1";
  const copy = COPY[status];

  const Icon =
    copy.tone === "wait" ? Clock : status === "DISABLED" ? ShieldAlert : XCircle;
  const iconTone =
    copy.tone === "wait"
      ? "bg-amber-50 text-amber-600"
      : "bg-red-50 text-red-600";

  return (
    <AuthCard
      title={copy.title}
      footer={
        <Link href="/" className="font-medium text-[#00B4A6] hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center ${iconTone}`}
        >
          <Icon size={18} />
        </span>
        <p className="text-sm text-gray-600 leading-relaxed pt-1.5">
          {copy.body}
        </p>
      </div>

      {status === "PENDING" && claimFiled && (
        <div className="mt-4 rounded-lg border border-[#00B4A6]/35 bg-teal-50/60 px-3.5 py-3 text-[13px] text-[#1A1A2E] leading-relaxed">
          Your request to become shop admin is under review by the platform
          team.
        </div>
      )}
    </AuthCard>
  );
}
