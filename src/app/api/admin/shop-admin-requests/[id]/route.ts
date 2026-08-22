/**
 * POST /api/admin/shop-admin-requests/[id] —— body: { action: "approve" | "reject", note? }
 *
 * 仅平台管理员。事务 + 重校验都在 lib/auth/review.ts 里,这里只做鉴权、状态码翻译,
 * 以及事务提交之后的审核结果邮件。
 */

import { NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/liveSession";
import {
  approveShopAdminRequest,
  rejectShopAdminRequest,
  statusForFailure,
} from "@/lib/auth/review";
import { notifyApproved } from "@/lib/email/notify";

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

  // 批准一条 CLAIM/REPLACE 顺带把申请人置成 APPROVED —— 那是一次真实的状态流转,
  // 所以发 approved。事务已提交才发,且 ALREADY_HANDLED 保证不会重复 (§B)。
  // 拒绝这里不发信: 拒绝"当管理员"不等于拒绝这个账号,User.status 没动。
  if ("newAdminUserId" in result) await notifyApproved(result.newAdminUserId);

  return NextResponse.json(result);
}
