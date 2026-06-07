import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { getActiveSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { redemptionCode } from "@/lib/db/schema";

/**
 * GET /api/admin/codes/batches
 * 返回所有 batch 概览(group by batch_id)。
 */
export async function GET() {
  const access = await getActiveSessionUser(await headers());
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }
  if (access.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      batchId: redemptionCode.batchId,
      createdBy: sql<string>`min(${redemptionCode.createdBy})`.as("createdBy"),
      channel: sql<string | null>`min(${redemptionCode.channel})`.as("channel"),
      credits: sql<number>`min(${redemptionCode.credits})`.as("credits"),
      total: sql<number>`count(*)::int`.as("total"),
      used: sql<number>`count(${redemptionCode.usedBy})::int`.as("used"),
      createdAt: sql<Date>`min(${redemptionCode.createdAt})`.as("createdAt"),
    })
    .from(redemptionCode)
    .groupBy(redemptionCode.batchId)
    .orderBy(sql`min(${redemptionCode.createdAt}) desc`);

  return NextResponse.json({
    batches: rows.map(r => ({
      batchId: r.batchId,
      createdBy: r.createdBy,
      channel: r.channel,
      credits: Number(r.credits),
      total: Number(r.total),
      used: Number(r.used),
      remaining: Number(r.total) - Number(r.used),
      createdAt: r.createdAt,
    })),
  });
}
