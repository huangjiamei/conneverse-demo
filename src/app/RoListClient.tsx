"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DeleteRoButton from "./DeleteRoButton";

// Server 端传下来的形状 (dates 已经序列化, decimals 已经转 string)
export type RoListItem = {
  id: string;
  cccRoNumber: string;
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  shopName: string;
  totalParts: number;
  searchedParts: number;
  orderedParts: number;
};

type Props = {
  repairOrders: RoListItem[];
};

export default function RoListClient({ repairOrders }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repairOrders;
    return repairOrders.filter((ro) =>
      ro.cccRoNumber.toLowerCase().includes(q),
    );
  }, [query, repairOrders]);

  return (
    <>
      {/* 搜索框 */}
      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search RO number…"
          className="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6]/30"
        />
        {query && (
          <span className="ml-3 text-xs text-gray-500">
            {filtered.length} of {repairOrders.length} match
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {query ? "No repair orders match." : "No repair orders yet."}
        </p>
      ) : (
        // 列数不超过实际卡片数 —— 搜索过滤后只剩 1~2 个时,
        // 三列会把卡片切窄并在右边留下空列。
        // auto-rows-fr + 卡片 h-full: 同页所有卡片等高,不随文字长短变。
        <div
          className={`grid gap-3 auto-rows-fr ${
            filtered.length >= 2 ? "sm:grid-cols-2" : ""
          } ${filtered.length >= 3 ? "xl:grid-cols-3" : ""}`}
        >
          {filtered.map((ro) => (
            <Link
              key={ro.id}
              href={`/ro/${ro.id}`}
              className="relative h-full min-h-[120px] flex flex-col bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition group"
            >
              <DeleteRoButton
                roId={ro.id}
                cccRoNumber={ro.cccRoNumber}
                vehicleLabel={`${ro.vehicleYear} ${ro.vehicleMake} ${ro.vehicleModel}`}
              />
              {/* 顶: RO number。pr-5 给右上角 absolute 删除按钮让位 */}
              <div className="font-mono text-xs text-gray-500 pr-5">
                RO #{ro.cccRoNumber}
              </div>

              {/* 中: 车辆 + 零件统计,flex-1 吃满剩余高度并垂直居中 */}
              <div className="flex-1 flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium">
                    {ro.vehicleYear} {ro.vehicleMake} {ro.vehicleModel}
                  </div>
                </div>
                <div className="text-right text-xs shrink-0">
                  <div className="text-gray-700 font-medium">
                    {ro.totalParts} parts
                  </div>
                  {ro.searchedParts > 0 && (
                    <div className="text-teal-600 mt-0.5">
                      {ro.searchedParts} searched
                    </div>
                  )}
                  {ro.orderedParts > 0 && (
                    <div className="text-amber-600 mt-0.5">
                      {ro.orderedParts} ordered
                    </div>
                  )}
                </div>
              </div>

              {/* 底: shop name */}
              <div className="text-xs text-gray-500 truncate">
                {ro.shopName}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
