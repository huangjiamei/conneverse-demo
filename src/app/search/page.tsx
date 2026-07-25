/**
 * /search — 独立车辆搜索页。
 *
 * 不依赖任何 RepairOrder / PartLine: 用户用 VCdb 级联下拉选一辆车, 填零件
 * 描述, 直接跑 matcher。纯客户端交互, 服务端只渲染外壳。
 */

import VehicleSearchClient from "./VehicleSearchClient";

export const metadata = {
  title: "New search — Conneverse",
};

export default function VehicleSearchPage() {
  return (
    <main className="max-w-[1440px] mx-auto p-8">
      <VehicleSearchClient />
    </main>
  );
}
