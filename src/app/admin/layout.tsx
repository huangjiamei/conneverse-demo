/**
 * /admin/** shell.
 *
 * Authorization is enforced once here for the whole subtree
 * (proxy already made an optimistic pass; this is the authoritative one).
 * The pending counts feed the tab badges that replaced the old Dashboard.
 */

import { prisma } from "@/lib/prisma";
import { requireLivePlatformAdmin } from "@/lib/auth/liveSession";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLivePlatformAdmin();

  const [pendingUsers, pendingRequests, paidOrders] = await Promise.all([
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.shopAdminRequest.count({ where: { status: "PENDING" } }),
    // PAID = 钱收了还没去采购, 正是履约待办
    prisma.purchaseOrder.count({ where: { status: "PAID" } }),
  ]);

  return (
    <>
      <AdminNav
        pendingUsers={pendingUsers}
        pendingRequests={pendingRequests}
        paidOrders={paidOrders}
      />
      {children}
    </>
  );
}
