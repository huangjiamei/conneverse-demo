/**
 * 邮件模板 —— 每个导出返回 { subject, html },不发信、不查库,纯函数。
 *
 * 刻意保持朴素内联 HTML:邮件客户端对 <style>/flex/grid 的支持一言难尽,
 * table + 内联 style 是唯一到处都对的写法。所有值都过 escapeHtml —— 店名和
 * 用户名来自库,注入进模板前必须转义。
 *
 * 以后加订单状态邮件,在这里加模板即可,发信层不用动。
 */

const NAVY = "#1A1A2E";
const TEAL = "#00B4A6";
const MUTED = "#6B7280";

export type EmailContent = { subject: string; html: string };

/**
 * 待审内容的三种形态。EMPLOYEE = 注册本身要过审;CLAIM/REPLACE = 已在店里的人
 * 申请当管理员 —— 后两种审的是另一件事,落地页也不同。
 */
export type ReviewKind = "EMPLOYEE" | "CLAIM" | "REPLACE";

const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  EMPLOYEE: "Employee access",
  CLAIM: "Shop admin — claiming a shop with no admin",
  REPLACE: "Shop admin — replacing the current admin",
};


export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 收件人可能没填 name —— 退化成不带称呼的开头 */
function greeting(name: string | null): string {
  return name && name.trim() ? `Hi ${escapeHtml(name.trim())},` : "Hi,";
}

function button(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background:${TEAL};">
          <a href="${escapeHtml(href)}"
             style="display:inline-block;padding:12px 22px;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/** 统一外壳:白卡 + navy 抬头 + PartHand 页脚 */
function layout(headline: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#F5F6F8;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${NAVY};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E5E7EB;border-radius:14px;">
      <tr>
        <td style="padding:28px 30px 8px;">
          <div style="font:700 17px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${NAVY};letter-spacing:-0.2px;">
            PartHand
          </div>
          <h1 style="margin:18px 0 0;font-size:20px;font-weight:600;color:${NAVY};">${escapeHtml(headline)}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 30px 28px;">${body}</td>
      </tr>
    </table>
    <p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
      Sent by PartHand · This is an automated message, please don't reply.
    </p>
  </body>
</html>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;">${text}</p>`;
}

/** 链接可能被邮件客户端截断 —— 按钮之外再给一份可复制的纯文本 */
function fallbackLink(href: string): string {
  return `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all;">
    If the button doesn't work, paste this into your browser:<br />
    <span style="color:${MUTED};">${escapeHtml(href)}</span>
  </p>`;
}

// ═══════════════════════════════════════════════════════════════
//  1. 注册后:验证邮箱
// ═══════════════════════════════════════════════════════════════

export function verifyEmail({
  name,
  verifyUrl,
}: {
  name: string | null;
  verifyUrl: string;
}): EmailContent {
  return {
    subject: "Verify your email address",
    html: layout(
      "Verify your email address",
      [
        p(greeting(name)),
        p(
          "Thanks for signing up for PartHand. Confirm this address to send your registration on for review."
        ),
        button(verifyUrl, "Verify email address"),
        p(
          `<span style="color:${MUTED};font-size:13px;">This link works once and expires in 24 hours. If you didn't create a PartHand account, you can ignore this email.</span>`
        ),
        fallbackLink(verifyUrl),
      ].join("")
    ),
  };
}

// ═══════════════════════════════════════════════════════════════
//  2. 邮箱验证通过:告诉申请人「已收到,在审核」
// ═══════════════════════════════════════════════════════════════

export function applicantReceived({
  name,
  shopName,
  kind,
  justVerified,
}: {
  name: string | null;
  shopName: string | null;
  kind: ReviewKind;
  /**
   * true = 刚点完验证链接过来的 (注册那条路径),那时「邮箱已验证」正是他关心的
   * 新消息;false = 早就验证过的成员事后提交申请,再提验证只会让人困惑。
   */
  justVerified: boolean;
}): EmailContent {
  const where = shopName ? ` for <strong>${escapeHtml(shopName)}</strong>` : "";
  const shop = shopName ? ` <strong>${escapeHtml(shopName)}</strong>` : " your shop";

  const lead = justVerified
    ? [
        p(
          `Your email is verified and your request${where} is now under review by the PartHand team.`
        ),
        kind === "EMPLOYEE"
          ? ""
          : p(
              "You also asked to be this shop's admin — that's part of the same review."
            ),
      ]
    : [
        p(
          `Your request to become the admin of${shop} is now under review by the PartHand team.`
        ),
        kind === "REPLACE"
          ? p(
              `<span style="color:${MUTED};font-size:13px;">Approving it would replace the shop's current admin.</span>`
            )
          : "",
      ];

  return {
    subject: "We've received your PartHand request",
    html: layout(
      "Your request is under review",
      [
        p(greeting(name)),
        ...lead,
        p("We'll email you as soon as a decision is made. Nothing to do until then."),
      ].join("")
    ),
  };
}

// ═══════════════════════════════════════════════════════════════
//  3. 邮箱验证通过:告诉平台管理员「有新申请」
// ═══════════════════════════════════════════════════════════════

export function adminNewRequest({
  applicantName,
  applicantEmail,
  shopName,
  kind,
  reviewUrl,
}: {
  applicantName: string | null;
  applicantEmail: string;
  shopName: string | null;
  kind: ReviewKind;
  reviewUrl: string;
}): EmailContent {
  const who = applicantName?.trim() || applicantEmail;
  const rows: [string, string][] = [
    ["Name", applicantName?.trim() || "—"],
    ["Email", applicantEmail],
    ["Shop", shopName ?? "—"],
    ["Requesting", REVIEW_KIND_LABEL[kind]],
  ];
  const table = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 4px;font-size:14px;">
      ${rows
        .map(
          ([k, v]) => `<tr>
        <td style="padding:4px 16px 4px 0;color:${MUTED};white-space:nowrap;">${escapeHtml(k)}</td>
        <td style="padding:4px 0;color:${NAVY};">${escapeHtml(v)}</td>
      </tr>`
        )
        .join("")}
    </table>`;

  return {
    subject: `New PartHand request — ${who}`,
    html: layout(
      "A new request is waiting for review",
      [
        p(
          "This request is from a verified email address and is waiting on the platform team:"
        ),
        table,
        button(reviewUrl, "Review request"),
      ].join("")
    ),
  };
}

// ═══════════════════════════════════════════════════════════════
//  3b. 有人申请加入店铺:告诉这家店的店铺管理员
// ═══════════════════════════════════════════════════════════════

/**
 * 收件人是店主/店铺管理员,不是平台团队 —— 措辞和落地页都不一样:
 * 他审的是"要不要让这个人进我的店",页面在 My Shop。
 */
export function shopAdminNewMember({
  applicantName,
  applicantEmail,
  shopName,
  reviewUrl,
}: {
  applicantName: string | null;
  applicantEmail: string;
  shopName: string | null;
  reviewUrl: string;
}): EmailContent {
  const who = applicantName?.trim() || applicantEmail;
  const shop = shopName ? escapeHtml(shopName) : "your shop";
  const rows: [string, string][] = [
    ["Name", applicantName?.trim() || "—"],
    ["Email", applicantEmail],
  ];
  const table = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0;font-size:14px;">
      ${rows
        .map(
          ([k, v]) => `<tr>
        <td style="padding:4px 16px 4px 0;color:${MUTED};white-space:nowrap;">${escapeHtml(k)}</td>
        <td style="padding:4px 0;color:${NAVY};">${escapeHtml(v)}</td>
      </tr>`
        )
        .join("")}
    </table>`;

  return {
    subject: `New member awaiting your approval — ${who}`,
    html: layout(
      `Someone asked to join ${shopName ? escapeHtml(shopName) : "your shop"}`,
      [
        p(
          `They registered for PartHand under <strong>${shop}</strong> and verified their email address. You decide whether they get access.`
        ),
        table,
        button(reviewUrl, "Review member"),
        p(
          `<span style="color:${MUTED};font-size:13px;">If you don't recognise them, reject the request — they won't be able to sign in.</span>`
        ),
      ].join("")
    ),
  };
}

// ═══════════════════════════════════════════════════════════════
//  4. 审核通过
// ═══════════════════════════════════════════════════════════════

export function approved({
  name,
  shopName,
  isShopAdmin,
  loginUrl,
}: {
  name: string | null;
  shopName: string | null;
  isShopAdmin: boolean;
  loginUrl: string;
}): EmailContent {
  const where = shopName ? ` for <strong>${escapeHtml(shopName)}</strong>` : "";
  return {
    subject: "Your PartHand account is approved",
    html: layout(
      "You're approved — welcome to PartHand",
      [
        p(greeting(name)),
        p(`Your PartHand account${where} has been approved. You can sign in now.`),
        isShopAdmin
          ? p(
              "You're set up as the shop admin, so you can also review your shop's other members and keep the shop details up to date."
            )
          : "",
        button(loginUrl, "Sign in to PartHand"),
        fallbackLink(loginUrl),
      ].join("")
    ),
  };
}

// ═══════════════════════════════════════════════════════════════
//  5. 审核未通过
// ═══════════════════════════════════════════════════════════════

export function rejected({
  name,
  shopName,
  reason,
}: {
  name: string | null;
  shopName: string | null;
  reason?: string | null;
}): EmailContent {
  const where = shopName ? ` for ${escapeHtml(shopName)}` : "";
  return {
    subject: "Update on your PartHand request",
    html: layout(
      "Your request wasn't approved",
      [
        p(greeting(name)),
        p(`Your PartHand access request${where} wasn't approved.`),
        reason?.trim()
          ? p(
              `<span style="color:${MUTED};">Reason given:</span> ${escapeHtml(reason.trim())}`
            )
          : "",
        p(
          "If you think this is a mistake, reply to whoever invited you or contact the PartHand team."
        ),
      ].join("")
    ),
  };
}
