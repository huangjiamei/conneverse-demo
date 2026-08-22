/**
 * /search — 独立车辆搜索页,也是三种角色的应用主页。
 *
 * 不依赖任何 RepairOrder / PartLine: 用户用 VCdb 级联下拉选一辆车, 填零件
 * 描述, 直接跑 matcher。纯客户端交互, 服务端只渲染外壳。
 *
 * 布局是上下的、结果全宽 —— 结果是图片密集的对比卡片,需要横向空间,
 * 所以这里不做左右分栏。
 *
 * 「申请成为本店管理员」的入口在 /profile,不在这里。
 */

import VehicleSearchClient from "./VehicleSearchClient";
import { requireLiveSession } from "@/lib/auth/liveSession";

export const metadata = {
  title: "Search — PartHand",
};

export default async function VehicleSearchPage() {
  // 权威会话:登录后被停用/降级的账号立刻失效,不等 token 过期
  const session = await requireLiveSession();

  return (
    <main className="w-full max-w-[1280px] mx-auto p-6">
      <VehicleSearchClient isPlatformAdmin={session.role === "PLATFORM_ADMIN"} />
    </main>
  );
}
