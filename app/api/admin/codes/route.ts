import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getActiveSessionUser } from "@/lib/auth/session";
import { generateBatch } from "@/lib/redemption/codes";

/**
 * POST /api/admin/codes
 * Body: { count: number, credits: number, channel?: string }
 * 仅 admin 可调,生成一批兑换码并返回 plaintext。
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

  let body: { count?: unknown; credits?: unknown; channel?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const count = Number(body.count);
  const credits = Number(body.credits);
  const channel =
    typeof body.channel === "string" && body.channel.trim() !== ""
      ? body.channel.trim()
      : undefined;

  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return NextResponse.json(
      { error: "count must be an integer in [1, 500]" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(credits) || credits < 1) {
    return NextResponse.json(
      { error: "credits must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const result = await generateBatch({
      count,
      credits,
      channel,
      createdBy: "admin",
    });
    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      codes: result.codes,
    });
  } catch (err) {
    console.error("[POST /api/admin/codes] error:", err);
    return NextResponse.json(
      { error: "Failed to generate batch" },
      { status: 500 },
    );
  }
}
