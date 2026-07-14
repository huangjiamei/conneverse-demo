import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Body = {
  partDescription?: string;
  partNumber?: string | null;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ partLineId: string }> }
) {
  const { partLineId } = await params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: { partDescription?: string; partNumber?: string | null } = {};
  if (typeof body.partDescription === "string") {
    data.partDescription = body.partDescription;
  }
  if (body.partNumber !== undefined) {
    data.partNumber = body.partNumber === "" ? null : body.partNumber;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.partLine.update({
      where: { id: partLineId },
      data,
    });
    return NextResponse.json({
      id: updated.id,
      partDescription: updated.partDescription,
      partNumber: updated.partNumber,
    });
  } catch {
    return NextResponse.json(
      { error: `PartLine not found: ${partLineId}` },
      { status: 404 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ partLineId: string }> }
) {
  const { partLineId } = await params;

  try {
    await prisma.partLine.delete({ where: { id: partLineId } });
    return NextResponse.json({ id: partLineId, deleted: true });
  } catch (err) {
    // P2025: 记录不存在 → 404
    // P2003: 外键约束 (PartLine 上还挂着 PurchaseOrder, 或某个 Candidate 挂着 PurchaseOrder)
    //        → 409, schema 是故意这样保护会计记录的
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json(
          { error: `PartLine not found: ${partLineId}` },
          { status: 404 }
        );
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          {
            error:
              "This part line has purchase orders and cannot be deleted.",
          },
          { status: 409 }
        );
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DELETE part-line] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}