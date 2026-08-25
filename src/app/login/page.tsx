/**
 * /login —— 登录页。
 *
 * 站点首页 (/) 现在默认落到市场落地页 /home,登录挪到了这里。凡是"去登录"
 * 的跳转 (守卫、退出、邮件里的 Sign in) 都指向 /login,不再指向 /。
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
        <div className="space-y-2">
          <div>
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-[#00B4A6] hover:underline"
            >
              Create one
            </Link>
          </div>
          <div>
            <Link
              href="/forgot-password"
              className="font-medium text-[#00B4A6] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
