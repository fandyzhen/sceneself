import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { desc } from "drizzle-orm";
import { getActiveSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { partnerApiKey } from "@/lib/db/schema";
import { generateApiKey, todayIsoDate } from "@/lib/redemption/api-keys";

/**
 * GET /api/admin/api-keys
 * 列出所有合作伙伴 API key(不返回 plaintext / hash)
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
      id: partnerApiKey.id,
      name: partnerApiKey.name,
      keyPrefix: partnerApiKey.keyPrefix,
      dailyLimit: partnerApiKey.dailyLimit,
      codesToday: partnerApiKey.codesToday,
      totalGenerated: partnerApiKey.totalGenerated,
      todayResetsAt: partnerApiKey.todayResetsAt,
      createdAt: partnerApiKey.createdAt,
      lastUsedAt: partnerApiKey.lastUsedAt,
      deactivated: partnerApiKey.deactivated,
    })
    .from(partnerApiKey)
    .orderBy(desc(partnerApiKey.createdAt));

  return NextResponse.json({ keys: rows });
}

/**
 * POST /api/admin/api-keys
 * Body: { name: string, dailyLimit?: number }
 * 返回创建后的元信息 + 一次性 plaintext(关闭后不再可见)
 */
export async function POST(request: NextRequest) {
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

  let body: { name?: unknown; dailyLimit?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  const dailyLimitRaw =
    body.dailyLimit === undefined || body.dailyLimit === null
      ? 1000
      : Number(body.dailyLimit);
  if (!Number.isInteger(dailyLimitRaw) || dailyLimitRaw < 1 || dailyLimitRaw > 1_000_000) {
    return NextResponse.json(
      { error: "dailyLimit must be an integer in [1, 1_000_000]" },
      { status: 400 },
    );
  }

  const { plaintext, hash, prefix } = generateApiKey();
  const id = randomUUID();

  await db.insert(partnerApiKey).values({
    id,
    name,
    keyHash: hash,
    keyPrefix: prefix,
    dailyLimit: dailyLimitRaw,
    todayResetsAt: todayIsoDate(),
  });

  return NextResponse.json({
    success: true,
    id,
    name,
    keyPrefix: prefix,
    dailyLimit: dailyLimitRaw,
    // 仅这一次返回 plaintext
    plaintextKey: plaintext,
  });
}
