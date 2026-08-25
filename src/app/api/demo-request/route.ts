/**
 * POST /api/demo-request —— body: { name, shop?, email, phone?, message? }
 *
 * 落地页 "Book a demo" 表单。复用现成的 sendEmail,发给平台收件箱。
 *
 * 收件人复用现成的"扇给全体平台管理员"那套 (Admin 表全员,一人一封;一个都没有
 * 时才退到 ADMIN_NOTIFY_EMAIL) —— 线索不该只落进一个人的收件箱。
 * 等 demo@parthand.com 配好,改 notifyDemoRequest 一处即可,这里不用动。
 *
 * 这是公开、无会话的接口,所以:
 *   · 限流按 IP,挡住拿它当群发管道;
 *   · 全部字段服务端重新校验并截断,邮件模板里再统一转义;
 *   · replyTo 不设成用户提交的地址 —— 那等于让陌生人决定回信去哪。收件人在
 *     邮件正文里能看到对方邮箱,手动回即可。
 */

import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/auth/rateLimit";
import { notifyDemoRequest } from "@/lib/email/notify";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 逐字段上限 —— 超长直接截断,不报错 */
const LIMITS = { name: 120, shop: 160, email: 254, phone: 40, message: 2000 };

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  const limit = rateLimit(`demo-request:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const raw = (body ?? {}) as Record<string, unknown>;

  const name = clean(raw.name, LIMITS.name);
  const email = clean(raw.email, LIMITS.email).toLowerCase();
  const shop = clean(raw.shop, LIMITS.shop);
  const phone = clean(raw.phone, LIMITS.phone);
  const message = clean(raw.message, LIMITS.message);

  if (!name) {
    return NextResponse.json({ error: "Please tell us your name." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid work email address." },
      { status: 400 }
    );
  }

  const delivered = await notifyDemoRequest({
    name,
    shop: shop || null,
    email,
    phone: phone || null,
    message: message || null,
  });

  if (!delivered) {
    // 一封都没发出去 (没配收件人 / 发信全失败)。notify 层已经记了日志,
    // 这里如实回失败 —— 谎称收到会让这条线索直接消失。
    return NextResponse.json(
      { error: "Could not send your request. Please try again in a moment." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
