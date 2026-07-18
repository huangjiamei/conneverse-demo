/**
 * Prisma Client 单例。
 *
 * Next.js dev 模式下,hot reload 会反复重新执行模块顶层代码。
 * 每次都 new PrismaClient() 会导致数据库连接数暴涨,把 Postgres 挤爆。
 * 用 globalThis 挂一个全局引用,dev 模式下重用,production 每个 worker
 * 只创建一次。
 *
 * Prisma 7 强制要求 driver adapter,所以要显式装配 PrismaPg。
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
