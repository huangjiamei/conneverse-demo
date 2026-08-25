/**
 * /register —— 公开注册页。已登录的话弹回各自 landing。
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { getLiveSession } from "@/lib/auth/liveSession";
import { landingPath } from "@/lib/auth/routes";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await getLiveSession();
  if (session) redirect(landingPath(session));

  return (
    <AuthCard
      title="Create your account"
      subtitle="Registrations are reviewed before access is granted."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#00B4A6] hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
