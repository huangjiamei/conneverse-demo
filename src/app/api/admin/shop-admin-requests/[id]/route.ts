/**
 * POST /api/admin/shop-admin-requests/[id] —— body: { action: "approve" | "reject", note? }
 *
 * 仅平台管理员。事务 + 重校验都在 lib/auth/review.ts 里,这里只做鉴权和状态码翻译。
 */

import { NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/liveSession";
import {
  approveShopAdminRequest,
  rejectShopAdminRequest,
  statusForFailure,
} from "@/lib/auth/review";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权威角色: Admin 行若已被删,旧 token 不该还能审
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    note?: unknown;
  };
  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject".' },
      { status: 400 }
    );
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;

  const result =
    action === "approve"
      ? await approveShopAdminRequest(id, session.id)
      : await rejectShopAdminRequest(id, session.id, note);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: statusForFailure(result.code) }
    );
  }
  return NextResponse.json(result);
}
