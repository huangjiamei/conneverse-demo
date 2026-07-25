/**
 * /search — 独立车辆搜索页。
 *
 * 不依赖任何 RepairOrder / PartLine: 用户用 VCdb 级联下拉选一辆车, 填零件
 * 描述, 直接跑 matcher。纯客户端交互, 服务端只渲染外壳。
 */

import VehicleSearchClient from "./VehicleSearchClient";
import QuoteBuilder from "./QuoteBuilder";
import { SourcingProvider } from "./SourcingContext";

export const metadata = {
  title: "New search — Conneverse",
};

export default function VehicleSearchPage() {
  return (
    <main className="w-full max-w-[1280px] mx-auto p-6">
      {/* SourcingProvider 让表格 (Select 按钮) 和 QuoteBuilder 共享选购状态 */}
      <SourcingProvider>
        {/* 左主内容 + 右侧 320px Quote Builder 侧栏。<lg 时侧栏掉到下方 */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0 w-full">
            <VehicleSearchClient />
          </div>
          <div className="w-full lg:w-[320px] flex-shrink-0">
            <QuoteBuilder />
          </div>
        </div>
      </SourcingProvider>
    </main>
  );
}
