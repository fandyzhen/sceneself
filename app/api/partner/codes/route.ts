import { NextRequest, NextResponse } from "next/server";
import { authenticateAndConsume } from "@/lib/redemption/api-keys";
import { generateBatch } from "@/lib/redemption/codes";

/**
 * POST /api/partner/codes
 * Headers: x-api-key: sk_xxx
 * Body: { count: number, credits: number, channel?: string }
 *
 * 合作伙伴自助批量生成。鉴权方式: x-api-key header (plaintext)。
 * 限额: dailyLimit / day (UTC)。
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key") ?? "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing x-api-key header" },
      { status: 401 },
    );
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

  // 鉴权 + 扣额度(原子)。失败时不调用 generateBatch。
  const auth = await authenticateAndConsume(apiKey, count);
  if (!auth.ok) {
    switch (auth.reason) {
      case "invalid":
        return NextResponse.json(
          { error: "Invalid API key" },
          { status: 401 },
        );
      case "deactivated":
        return NextResponse.json(
          { error: "API key has been deactivated" },
          { status: 403 },
        );
      case "daily_limit_exceeded":
        return NextResponse.json(
          { error: "Daily limit exceeded" },
          { status: 429 },
        );
    }
  }

  try {
    const result = await generateBatch({
      count,
      credits,
      channel,
      createdBy: auth.keyRow.id,
    });
    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      codes: result.codes,
    });
  } catch (err) {
    console.error("[POST /api/partner/codes] error:", err);
    return NextResponse.json(
      { error: "Failed to generate batch" },
      { status: 500 },
    );
  }
}
