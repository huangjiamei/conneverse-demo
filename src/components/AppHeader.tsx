/**
 * Sticky navy app header.
 * 
 * 借鉴 main 分支的视觉设计:
 *   - 深色 navy 底 + teal 副标题
 *   - sticky top-0
 *   - max-w-[1200px] 主容器
 * 
 * 但不依赖 ShopContext (master 分支没有). 目前是纯静态显示.
 * 未来接入实际 shop 数据后, 把 shopName 从 props 传进来.
 */

import Link from "next/link";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 bg-[#1B2838] text-white shadow-lg">
      {/* px-8 与各 page 的 p-8 对齐,logo 和内容左边缘同一条线 */}
      <div className="max-w-[1440px] mx-auto px-8 h-14 flex items-center justify-between">
        <Link href="/" className="group">
          <span className="text-lg sm:text-xl font-bold tracking-tight group-hover:text-[#00B4A6] transition">
            Conneverse
          </span>
          <span className="block text-[12px] text-[#00B4A6] -mt-0.5 tracking-wide">
            Trusted Parts Agent
          </span>
        </Link>

        {/* 未来加导航链接 (Analytics / Settings) 放这里 */}
        <div className="flex items-center gap-4">
          {/* 占位, 现在不放导航 */}
        </div>
      </div>
    </header>
  );
}