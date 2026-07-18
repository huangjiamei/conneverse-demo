import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roId: string }> },
) {
  const { roId } = await params;

  try {
    await prisma.repairOrder.delete({ where: { id: roId } });
    return NextResponse.json({ id: roId, deleted: true });
  } catch (err) {
    // P2025: 记录不存在 → 404
    // P2003: 外键约束 (RO 下某 PartLine 已有 PurchaseOrder, 或 Candidate 挂 PurchaseOrder)
    //        → 409, 会计记录保护
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json(
          { error: `RepairOrder not found: ${roId}` },
          { status: 404 },
        );
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          {
            error:
              "This RO contains part lines with purchase orders and cannot be deleted.",
          },
          { status: 409 },
        );
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DELETE repair-order] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
