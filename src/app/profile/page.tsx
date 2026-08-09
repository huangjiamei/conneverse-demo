/**
 * /profile —— every role lands here from the header.
 *
 * Identity comes from getLiveSession (authoritative role/status), the shop name
 * from the session's shopId. Email is display-only this batch.
 */

import { prisma } from "@/lib/prisma";
import { requireLiveSession } from "@/lib/auth/liveSession";
import { ROLE_LABEL } from "@/lib/auth/routes";
import { RequestAdminSection } from "@/components/review/RequestAdminSection";
import { NameForm, PasswordForm } from "./ProfileForms";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireLiveSession();

  const shop = session.shopId
    ? await prisma.shop.findUnique({
        where: { id: session.shopId },
        select: { name: true, city: true, state: true },
      })
    : null;

  const where = shop ? [shop.city, shop.state].filter(Boolean).join(", ") : "";

  return (
    <main className="w-full max-w-[1280px] mx-auto p-8">
      <h1 className="text-2xl font-semibold text-[#1A1A2E]">Profile</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your account details and password.
      </p>

      {/* 左: 账号信息 (只读) + 申请当店铺管理员 · 右: 可编辑的表单。
          骨架与 /shop、/admin/shops/[id] 一致;lg 以下堆叠。 */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {/* 只读身份信息 */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wide text-gray-500">
              Account
            </h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Row
                label="Email"
                hint="Contact the platform team to change this"
              >
                {session.email}
              </Row>
              <Row label="Role">{ROLE_LABEL[session.role]}</Row>
              <Row label="Shop">
                {shop ? (
                  <>
                    {shop.name}
                    {where && <span className="text-gray-400"> — {where}</span>}
                  </>
                ) : (
                  <span className="text-gray-400">
                    Not tied to a shop (platform-wide)
                  </span>
                )}
              </Row>
            </dl>
          </section>

          {/* 普通员工申请成为本店管理员的入口 (管理员和平台管理员看不到) */}
          <RequestAdminSection />
        </div>

        {/* 表单列。输入框拉到 780px 宽既难看也难用, 所以这一列的内容
            自己收在 620px 以内。 */}
        <div className="flex max-w-[620px] flex-col gap-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wide text-gray-500">
              Your details
            </h2>
            <NameForm initialName={session.name ?? ""} />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wide text-gray-500">
              Change password
            </h2>
            <PasswordForm />
          </section>
        </div>
      </div>
    </main>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[#1A1A2E]">{children}</dd>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
