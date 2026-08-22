/**
 * 发信层 —— Resend,唯一出口。
 *
 * 三条硬规则,调用方不用再操心:
 *   1. 收件人只能由服务端从库/会话取出后传进来,绝不接受前端提交的地址。
 *   2. 发不出去也绝不抛 —— 注册/审核这些主流程不能因为邮件挂掉而回滚。
 *      失败只记日志并返回 ok:false,事后可以重发。
 *   3. key / 发信人只从 process.env 读,仓库里不留任何凭据。
 *
 * 客户端懒建:RESEND_API_KEY 缺失时整个模块照样能 import (build 阶段不炸),
 * 只是每次发信都直接判失败。
 */

import { Resend } from "resend";

let cached: Resend | null = null;

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cached) cached = new Resend(key);
  return cached;
}

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: string };

/**
 * @param to 已经从库/会话里取出来的真实收件人
 * @returns 永不 reject;失败信息在返回值里
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM;
  const resend = client();

  if (!resend || !from) {
    const reason = !resend
      ? "RESEND_API_KEY is not set"
      : "EMAIL_FROM is not set";
    console.error(`[email] skipped "${subject}" — ${reason}`);
    return { ok: false, reason };
  }

  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) {
    console.error(`[email] skipped "${subject}" — no recipient`);
    return { ok: false, reason: "no recipient" };
  }

  try {
    // Resend SDK 把 API 错误放在 error 字段里返回,不 throw —— 两种都要接
    const { data, error } = await resend.emails.send({
      from,
      to: recipients,
      subject,
      html,
    });
    if (error) {
      console.error(
        `[email] failed "${subject}" → ${recipients.join(", ")}:`,
        error.message ?? error
      );
      return { ok: false, reason: error.message ?? "Resend rejected the send" };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    // 网络中断 / DNS / 超时
    console.error(
      `[email] threw while sending "${subject}" → ${recipients.join(", ")}:`,
      err
    );
    return { ok: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}
