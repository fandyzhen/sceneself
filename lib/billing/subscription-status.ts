// 订阅有效性判定：决定生成是否带水印（有有效订阅 → 无水印）。
// isActiveSubscription 是纯函数（可测）；hasActiveSubscription 是薄 db 包装。
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";

const ACTIVE_STATUSES: readonly string[] = ["active", "trialing"];

export function isActiveSubscription(
  sub: { status: string; currentPeriodEnd: Date | null } | null,
  now: Date,
): boolean {
  if (!sub) return false;
  if (!ACTIVE_STATUSES.includes(sub.status)) return false;
  // currentPeriodEnd 为 null 视为长期有效（手动授予/未知周期）；有值则需未过期。
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= now.getTime()) return false;
  return true;
}

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const rows = await db
    .select({ status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd })
    .from(subscription)
    .where(and(eq(subscription.userId, userId), inArray(subscription.status, ["active", "trialing"])))
    .orderBy(desc(subscription.currentPeriodEnd))
    .limit(1);
  return isActiveSubscription(rows[0] ?? null, new Date());
}
