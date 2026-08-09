/**
 * "Become this shop's admin" — a Profile section (was a banner on the app home).
 *
 * Renders nothing for the platform admin (no shop) or the current shop admin
 * (already has My Shop). The request kind is derived server-side from the shop's
 * state, so this only decides the wording:
 *   no admin yet → CLAIM, nobody can review this shop's registrations
 *   has an admin → REPLACE, approving it demotes the incumbent
 */

import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/auth/liveSession";
import { RequestAdminButton } from "./RequestAdminButton";

export async function RequestAdminSection() {
  const session = await getLiveSession();
  if (!session || session.kind !== "user" || !session.shopId) return null;
  if (session.role === "SHOP_ADMIN") return null; // 他已经是管理员了

  const [shop, pending] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: session.shopId },
      select: {
        name: true,
        adminUserId: true,
        adminUser: { select: { name: true, email: true } },
      },
    }),
    prisma.shopAdminRequest.findFirst({
      where: { shopId: session.shopId, userId: session.id, status: "PENDING" },
      select: { kind: true },
    }),
  ]);
  if (!shop) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-gray-500">
        Shop admin
      </h2>

      {pending ? (
        <p className="text-sm leading-relaxed text-gray-600">
          Your request to administer{" "}
          <span className="font-medium text-[#1A1A2E]">{shop.name}</span> is
          under review by the platform team.
        </p>
      ) : shop.adminUserId === null ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-relaxed text-gray-600">
            <span className="font-medium text-[#1A1A2E]">{shop.name}</span>{" "}
            doesn&apos;t have an admin yet. Registrations for your shop
            can&apos;t be reviewed until someone takes it on.
          </p>
          <RequestAdminButton
            label="Apply to be shop admin"
            variant="solid"
            confirm={null}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-relaxed text-gray-600">
            <span className="font-medium text-[#1A1A2E]">{shop.name}</span> is
            administered by{" "}
            {shop.adminUser?.name ?? shop.adminUser?.email ?? "another member"}.
          </p>
          <RequestAdminButton
            label="Request admin rights for this shop"
            variant="link"
            confirm={`Request to replace the current admin of ${shop.name}? The platform team reviews this, and if approved the current admin becomes a regular employee.`}
          />
        </div>
      )}
    </section>
  );
}
