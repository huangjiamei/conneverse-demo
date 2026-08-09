/**
 * PATCH /api/profile —— body: { name }
 *
 * Renames the signed-in account. Which table gets written follows the session
 * kind, never a client-supplied id: an admin edits `Admin`, a user edits `User`.
 *
 * Email stays read-only this batch (it is the login identity and is unique
 * across both tables — changing it needs its own flow).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/auth/liveSession";

export const dynamic = "force-dynamic";

const MAX_NAME = 120;

export async function PATCH(req: Request) {
  const session = await getLiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json(
      { error: "Please fix the errors below.", fieldErrors: { name: "Name is required." } },
      { status: 400 }
    );
  }
  if (name.length > MAX_NAME) {
    return NextResponse.json(
      {
        error: "Please fix the errors below.",
        fieldErrors: { name: `Keep it under ${MAX_NAME} characters.` },
      },
      { status: 400 }
    );
  }

  if (session.kind === "admin") {
    await prisma.admin.update({ where: { id: session.id }, data: { name } });
  } else {
    await prisma.user.update({ where: { id: session.id }, data: { name } });
  }

  // 会话 cookie 里还存着旧名字,但 layout 用的是 getLiveSession (回库读),
  // 所以刷新后头部立刻显示新名字,不需要重签 token。
  return NextResponse.json({ ok: true, name });
}
