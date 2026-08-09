/**
 * /admin/shops —— every shop, with its current admin, size and pending-request
 * count. Creating happens here; editing, deleting and admin management happen
 * in the per-shop detail page.
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { EmptyState, PageHeader } from "@/components/review/shell";
import { CreateShopButton } from "./CreateShopButton";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  MECHANICAL: "Mechanical",
  COLLISION: "Collision",
};

export default async function AdminShopsPage() {
  const shops = await prisma.shop.findMany({
    orderBy: { name: "asc" },
    include: {
      adminUser: { select: { name: true, email: true } },
      _count: {
        select: {
          members: true,
          repairOrders: true,
          adminRequests: { where: { status: "PENDING" } },
        },
      },
    },
  });

  return (
    <main className="w-full max-w-[1280px] mx-auto p-8">
      <PageHeader
        title="Shops"
        subtitle="Create, edit and assign an admin to each shop."
        right={<CreateShopButton />}
      />

      {shops.length === 0 ? (
        <EmptyState>No shops yet. Create the first one above.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shops.map((s) => {
            const where = [s.city, s.state].filter(Boolean).join(", ");
            return (
              <li key={s.id}>
                <Link
                  href={`/admin/shops/${s.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-gray-200
                             bg-white p-4 transition hover:border-[#00B4A6] hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[#1A1A2E]">{s.name}</span>
                      {where && (
                        <span className="text-xs text-gray-400">{where}</span>
                      )}
                      {s.type && (
                        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          {TYPE_LABEL[s.type]}
                        </span>
                      )}
                      {s._count.adminRequests > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          {s._count.adminRequests} pending request
                          {s._count.adminRequests === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      Admin:{" "}
                      {s.adminUser ? (
                        <span className="text-[#1A1A2E]">
                          {s.adminUser.name ?? s.adminUser.email}
                        </span>
                      ) : (
                        <span className="text-amber-600 font-medium">
                          — none
                        </span>
                      )}
                      <span className="text-gray-400">
                        {" · "}
                        {s._count.members} member
                        {s._count.members === 1 ? "" : "s"}
                        {" · "}
                        {s._count.repairOrders} RO
                        {s._count.repairOrders === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <ChevronRight size={18} className="shrink-0 text-gray-300" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
