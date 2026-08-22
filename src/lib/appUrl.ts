/**
 * 绝对站点地址 —— 邮件链接、Stripe 回跳都要它。
 *
 * 唯一来源是 APP_URL 这一条环境变量 (Vercel + 本地 .env 各一份,值都是
 * https://parthand.com)。刻意不再认 NEXT_PUBLIC_APP_URL 之类的别名:两个名字
 * 迟早会各指一处,验证链接发去 A 而 Stripe 跳回 B 是最难查的那种 bug。
 * 代码里也不许出现任何硬编码的部署域名 —— 换域名只该改这一条变量。
 *
 * 兜底的 localhost 只服务"变量根本没配"的场景 (比如 CI 里跑 build)。
 */

export function appUrl(): string {
  const raw = process.env.APP_URL ?? "http://localhost:3000";
  // 结尾斜杠会拼出 //verify-email 这种地址,统一削掉
  return raw.replace(/\/+$/, "");
}
