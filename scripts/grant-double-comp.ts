/**
 * 一次性脚本：给指定 email 的用户补发积分,走 ledger 事务。
 *
 * 起因:refundForUndelivered 漏了 × 2 倍数(见 lib/scene/pricing.ts 的修复)。
 * 与 admin API (POST /api/admin/users/[userId]/credits) 同源。
 *
 * 运行:
 *   pnpm tsx scripts/grant-double-comp.ts <email> <delta> [<reason>]
 */
import { config } from "dotenv";

// Next.js 自动加载 .env.local,独立 tsx 脚本必须显式加载。
// 必须在 import lib/db 之前 —— 否则 db 用默认 postgres URL 初始化连接。
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const [email, deltaStr, reason] = process.argv.slice(2);
  if (!email || !deltaStr) {
    console.error("用法: pnpm tsx scripts/grant-double-comp.ts <email> <delta> [<reason>]");
    process.exit(1);
  }
  const delta = Number(deltaStr);
  if (!Number.isFinite(delta) || delta === 0) {
    console.error(`delta 必须是非零数字,收到: ${deltaStr}`);
    process.exit(1);
  }

  // dynamic import 确保上面的 dotenv config 已生效再加载 db
  const { db } = await import("../lib/db");
  const { user, creditLedger } = await import("../lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { randomUUID } = await import("crypto");

  const target = await db.select({ id: user.id, email: user.email, credits: user.credits })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (target.length === 0) {
    console.error(`找不到用户: ${email}`);
    process.exit(1);
  }

  const u = target[0];
  console.log(`\n找到用户: ${u.email}`);
  console.log(`  userId  = ${u.id}`);
  console.log(`  调整前  = ${u.credits} 积分`);
  console.log(`  delta   = ${delta > 0 ? "+" : ""}${delta}`);
  console.log(`  reason  = ${reason || "adjustment"}`);
  console.log("");

  await db.transaction(async tx => {
    await tx.update(user)
      .set({ credits: sql`${user.credits} + ${delta}`, updatedAt: new Date() })
      .where(eq(user.id, u.id));
    await tx.insert(creditLedger).values({
      id: randomUUID(),
      userId: u.id,
      delta,
      reason: reason || "adjustment",
    });
  });

  const after = await db.select({ credits: user.credits }).from(user).where(eq(user.id, u.id)).limit(1);
  console.log(`✅ 调整完成,新余额 = ${after[0].credits} 积分`);
  process.exit(0);
}

main().catch(err => {
  console.error("脚本失败:", err);
  process.exit(1);
});
