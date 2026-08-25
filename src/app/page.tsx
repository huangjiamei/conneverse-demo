/**
 * / —— 站点根路径,本身不渲染内容,只决定往哪送。
 *
 *   已登录 → 各自的 landing (/search;未批准的走 /pending)
 *   未登录 → 市场落地页 /home
 *
 * 落地页刻意留在 /home 而不是搬到这里:它是独立的一屏营销页,
 * 有自己的 metadata 和不挂 AppHeader 的规则 (见 lib/auth/routes 的 isChromeless),
 * 让 / 保持"纯分流"这一件事,比把两套逻辑塞进同一个文件干净。
 */

import { redirect } from "next/navigation";
import { getLiveSession } from "@/lib/auth/liveSession";
import { landingPath } from "@/lib/auth/routes";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await getLiveSession();
  redirect(session ? landingPath(session) : "/home");
}
