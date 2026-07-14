import { NextResponse } from "next/server";
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