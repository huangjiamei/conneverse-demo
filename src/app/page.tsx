/**
 * / —— 登录页 (= 首页)。
 *
 * 已登录的话 proxy 就把人弹到各自 landing 了;这里再挡一次,防止
 * proxy matcher 漏配或直接渲染时绕过。
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { getLiveSession } from "@/lib/auth/liveSession";
import { landingPath } from "@/lib/auth/routes";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getLiveSession();
  if (session) redirect(landingPath(session));

  return (
    <AuthCard
      title="Sign in"
      subtitle="Access quality-verified parts for your shop."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-[#00B4A6] hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
