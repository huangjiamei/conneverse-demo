/**
 * /forgot-password —— 公开页 (忘了密码的人当然登不进来)。
 *
 * 只服务 User 账号。平台管理员的密码走 DB / Profile,不在这条路上 —— 但页面
 * 上一个字都不提这件事:说了就等于告诉别人"这个邮箱是平台管理员"。
 */

import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reset your password — PartHand" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter the email you signed up with and we'll send you a reset link."
      footer={
        <Link href="/" className="font-medium text-[#00B4A6] hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
