#!/usr/bin/env tsx
/**
 * 测试账号初始化脚本（仅用于本地/测试环境）。
 * 建立/更新 35457311@qq.com（密码 dongdong）为：
 *   - emailVerified = true
 *   - 100000 积分
 *   - yearly 有效订阅（无水印）
 *
 * 运行：pnpm test-user:setup
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { resolve } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { user, account, subscription, creditLedger } from "../lib/db/schema";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const EMAIL = "35457311@qq.com";
const PASSWORD = "dongdong";
const CREDITS = 100000;
const PLAN = "yearly";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ 缺少 DATABASE_URL（请检查 .env.local）");
    process.exit(1);
  }
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  try {
    const pwHash = await hashPassword(PASSWORD);
    const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const existing = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1);
    let userId: string;

    if (existing.length === 0) {
      userId = randomUUID();
      await db.insert(user).values({
        id: userId,
        name: "测试用户",
        email: EMAIL,
        emailVerified: true,
        credits: CREDITS,
        role: "user",
        planKey: PLAN,
      });
      await db.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: pwHash,
      });
      console.log(`✓ 新建测试用户 ${EMAIL}`);
    } else {
      userId = existing[0].id;
      await db
        .update(user)
        .set({ credits: CREDITS, emailVerified: true, planKey: PLAN })
        .where(eq(user.id, userId));
      const acc = await db
        .select()
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
        .limit(1);
      if (acc.length === 0) {
        await db.insert(account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: pwHash,
        });
      } else {
        await db.update(account).set({ password: pwHash }).where(eq(account.id, acc[0].id));
      }
      console.log(`✓ 更新测试用户 ${EMAIL}`);
    }

    // upsert 年付有效订阅（无水印）
    const subId = `manual_test_${EMAIL}`;
    const existingSub = await db
      .select()
      .from(subscription)
      .where(eq(subscription.providerSubId, subId))
      .limit(1);
    if (existingSub.length === 0) {
      await db.insert(subscription).values({
        id: randomUUID(),
        provider: "manual",
        providerSubId: subId,
        userId,
        planKey: PLAN,
        status: "active",
        currentPeriodEnd: periodEnd,
      });
    } else {
      await db
        .update(subscription)
        .set({ userId, planKey: PLAN, status: "active", currentPeriodEnd: periodEnd })
        .where(eq(subscription.providerSubId, subId));
    }

    await db.insert(creditLedger).values({
      id: randomUUID(),
      userId,
      delta: CREDITS,
      reason: "manual_grant",
    });

    console.log(`✅ 完成：${EMAIL} / 密码 ${PASSWORD} · ${CREDITS} 积分 · ${PLAN} 年付订阅（生成无水印）`);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.error("❌ 失败:", e);
    await client.end();
    process.exit(1);
  }
}

main();
