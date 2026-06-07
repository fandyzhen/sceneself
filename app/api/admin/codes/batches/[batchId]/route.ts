import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getActiveSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { redemptionCode, user } from "@/lib/db/schema";

/**
 * GET /api/admin/codes/batches/[batchId]
 * 返回该 batch 的全部码 + 兑换者邮箱
 */
export async function GET(
  _request: Request,
  props: { params: Promise<{ batchId: string }> },
) {
  const params = await props.params;
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
      code: redemptionCode.code,
      credits: redemptionCode.credits,
      channel: redemptionCode.channel,
      usedBy: redemptionCode.usedBy,
      usedAt: redemptionCode.usedAt,
      createdBy: redemptionCode.createdBy,
      createdAt: redemptionCode.createdAt,
      userEmail: user.email,
      userName: user.name,
    })
    .from(redemptionCode)
    .leftJoin(user, eq(redemptionCode.usedBy, user.id))
    .where(eq(redemptionCode.batchId, params.batchId));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json({
    batchId: params.batchId,
    codes: rows,
  });
}
