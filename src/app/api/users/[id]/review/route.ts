/**
 * POST /api/users/[id]/review —— body: { action: "approve" | "reject" }
 *
 * 一条路由同时服务两种审核人,授权在这里判定,shopId 只从会话取:
 *   PLATFORM_ADMIN → 可审任何人 (§3 兜底), 盖 approvedByAdminId
 *   SHOP_ADMIN     → 只能审 user.shopId === 自己 shopId 的人, 盖 approvedByUserId
 *   EMPLOYEE       → 403
 *
 * 跨店越权由 reviewUser() 在事务里再判一次 (§2 硬校验)。批准还要求对方已验证邮箱
 * —— 没验证的注册不算进入待审核,reviewUser 会回 EMAIL_UNVERIFIED (422)。
 *
 * 审核结果邮件在事务提交之后发,发不出去也不影响审核已经生效。
 */

import { NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/liveSession";
import { reviewUser, statusForFailure, type Reviewer } from "@/lib/auth/review";
import { notifyApproved, notifyRejected } from "@/lib/email/notify";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 权威角色: 被 REPLACE 顶掉的旧管理员不能再用旧 token 审人
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let reviewer: Reviewer;
  if (session.role === "PLATFORM_ADMIN") {
    reviewer = { kind: "admin", id: session.id };
  } else if (session.role === "SHOP_ADMIN" && session.shopId) {
    reviewer = { kind: "user", id: session.id, shopId: session.shopId };
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    note?: unknown;
  };
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject".' },
      { status: 400 }
    );
  }
  // 拒绝时可以附一句理由 —— User 上没有存它的字段,只带进那封 rejected 邮件
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : undefined;

  const result = await reviewUser(id, body.action, reviewer);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: statusForFailure(result.code) }
    );
  }

  // 事务已提交,状态真的翻了才发信 (§B 幂等: reviewUser 只接受 PENDING → 终态,
  // 对已处理的用户会走 ALREADY_HANDLED,所以这里天然只发一次)。
  // notify* 不抛 —— 发信失败不该让审核动作变成 500。
  if (result.status === "APPROVED") await notifyApproved(result.userId);
  else await notifyRejected(result.userId, note);

  return NextResponse.json(result);
}
