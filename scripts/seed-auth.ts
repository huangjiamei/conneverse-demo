/**
 * 幂等 seed:平台管理员 + 几家演示店铺。
 *
 *   npx tsx scripts/seed-auth.ts
 *
 * 管理员口令从 SEED_ADMIN_PASSWORD 读,缺省 ChangeMe123!(仅本地演示用)。
 * 已存在的 Admin 不会被改密 —— 想重置就先删了那行再跑,或显式传 --reset-password。
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth/password";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@conneverse.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
const RESET_PASSWORD = process.argv.includes("--reset-password");

const DEMO_SHOPS = [
  { name: "Bay Auto Care", city: "San Francisco", state: "CA" },
  { name: "Golden Gate Collision Center", city: "Oakland", state: "CA" },
];

async function main() {
  const existing = await prisma.admin.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });

  if (!existing) {
    await prisma.admin.create({
      data: {
        email: ADMIN_EMAIL,
        name: "Platform Admin",
        passwordHash: await hashPassword(ADMIN_PASSWORD),
      },
    });
    console.log(`✔ created platform admin ${ADMIN_EMAIL}`);
  } else if (RESET_PASSWORD) {
    await prisma.admin.update({
      where: { email: ADMIN_EMAIL },
      data: { passwordHash: await hashPassword(ADMIN_PASSWORD) },
    });
    console.log(`✔ reset password for ${ADMIN_EMAIL}`);
  } else {
    console.log(`· platform admin ${ADMIN_EMAIL} already exists — left as is`);
  }

  for (const shop of DEMO_SHOPS) {
    const row = await prisma.shop.upsert({
      where: { name: shop.name },
      update: { city: shop.city, state: shop.state },
      create: shop,
      select: { id: true, adminUserId: true },
    });
    console.log(
      `· shop ${shop.name} ${row.adminUserId ? "(has admin)" : "(no admin — claimable)"}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
