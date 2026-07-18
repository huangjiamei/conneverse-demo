import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { importRoFromXlsx } from "@/lib/import-ro";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded (expected 'file' field)" },
        { status: 400 },
      );
    }

    // 粗校验扩展名, xlsx.read 本身也会拒真的非法内容
    const name = file.name || "";
    if (!/\.(xlsx|xlsm|xls)$/i.test(name)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${name}` },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await importRoFromXlsx(prisma, buffer);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload-ro] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
