import { db } from "@/lib/db";
import { user, payment, generationJob, generationFrame, creditLedger } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { AdminDashboard } from "@/features/admin/components/admin-dashboard";

export default async function AdminPage() {
  // 获取统计数据
  const [
    totalUsers,
    activeUsers,
    totalPayments,
    totalRevenue,
    totalSceneJobs,
    totalCreditsUsed,
    monthlyDroppedStats,
    topConsumersRaw,
  ] = await Promise.all([
    // 总用户数
    db.select({ count: sql<number>`count(*)` }).from(user),

    // 活跃用户数（30天内）
    db.select({ count: sql<number>`count(*)` }).from(user)
      .where(sql`${user.updatedAt} > NOW() - INTERVAL '30 days'`),

    // 总支付次数
    db.select({ count: sql<number>`count(*)` }).from(payment),

    // 总收入（分）
    db.select({ total: sql<number>`COALESCE(sum(${payment.amountCents}), 0)` }).from(payment)
      .where(sql`${payment.status} = 'succeeded'`),

    // 总 Scene 任务数(产品核心指标)
    db.select({ count: sql<number>`count(*)` }).from(generationJob),

    // 总积分消耗
    db.select({ total: sql<number>`COALESCE(sum(abs(${creditLedger.delta})), 0)` })
      .from(creditLedger)
      .where(sql`${creditLedger.delta} < 0`),

    // 本月 dropped 率 = dropped / (passed + swapped + dropped),只算最终态。
    // 衡量产品质量 + 成本压力:dropped 高 → 2× 退款多 → 利润下滑。
    db.select({
      dropped: sql<number>`COUNT(*) FILTER (WHERE ${generationFrame.status} = 'dropped')`,
      delivered: sql<number>`COUNT(*) FILTER (WHERE ${generationFrame.status} IN ('passed', 'swapped'))`,
    })
      .from(generationFrame)
      .where(sql`${generationFrame.createdAt} > DATE_TRUNC('month', NOW())`),

    // 本月 top 10 消耗用户(按 scene_set 扣费聚合)。识别囤积型重度用户。
    db
      .select({
        userId: creditLedger.userId,
        userName: user.name,
        userEmail: user.email,
        consumed: sql<number>`SUM(ABS(${creditLedger.delta}))`,
        txns: sql<number>`COUNT(*)`,
      })
      .from(creditLedger)
      .leftJoin(user, sql`${creditLedger.userId} = ${user.id}`)
      .where(
        sql`${creditLedger.delta} < 0 AND ${creditLedger.reason} = 'scene_set' AND ${creditLedger.createdAt} > DATE_TRUNC('month', NOW())`,
      )
      .groupBy(creditLedger.userId, user.name, user.email)
      .orderBy(sql`SUM(ABS(${creditLedger.delta})) DESC`)
      .limit(10),
  ]);

  // 获取最近的用户
  const recentUsers = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      credits: user.credits,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(sql`${user.createdAt} desc`)
    .limit(5);

  // 获取最近的支付
  const recentPayments = await db
    .select({
      id: payment.id,
      userId: payment.userId,
      userName: user.name,
      userEmail: user.email,
      amountCents: payment.amountCents,
      status: payment.status,
      type: payment.type,
      createdAt: payment.createdAt,
    })
    .from(payment)
    .leftJoin(user, sql`${payment.userId} = ${user.id}`)
    .orderBy(sql`${payment.createdAt} desc`)
    .limit(5);

  const droppedRow = monthlyDroppedStats[0];
  const droppedCount = Number(droppedRow?.dropped ?? 0);
  const deliveredCount = Number(droppedRow?.delivered ?? 0);
  const totalFrames = droppedCount + deliveredCount;
  const monthlyDroppedRate = totalFrames > 0 ? droppedCount / totalFrames : 0;

  const topConsumers = topConsumersRaw.map(c => ({
    userId: c.userId,
    userName: c.userName,
    userEmail: c.userEmail,
    consumed: Number(c.consumed),
    txns: Number(c.txns),
  }));

  const stats = {
    totalUsers: totalUsers[0].count,
    activeUsers: activeUsers[0].count,
    totalPayments: totalPayments[0].count,
    totalRevenue: totalRevenue[0].total / 100, // 转换为元
    totalSceneJobs: totalSceneJobs[0].count,
    totalCreditsUsed: totalCreditsUsed[0].total,
    monthlyDroppedRate,
    monthlyDroppedCount: droppedCount,
    monthlyDeliveredCount: deliveredCount,
  };

  return (
    <AdminDashboard
      stats={stats}
      recentUsers={recentUsers}
      recentPayments={recentPayments}
      topConsumers={topConsumers}
    />
  );
}
