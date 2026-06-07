import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getActiveSessionUser } from "@/lib/auth/session";
import { normalizeCode, CODE_LENGTH } from "@/lib/redemption/code-utils";
import { redeemCode } from "@/lib/redemption/redeem";

/**
 * POST /api/redeem
 * Body: { code: string } - 可含 dash
 *
 * 状态码:
 *  - 200: { creditsAdded, newBalance, channel?, batchId }
 *  - 400: 输入格式错误
 *  - 401: 未登录
 *  - 403: 用户被封禁
 *  - 404: 码不存在
 *  - 409: 已被使用
 *  - 410: 已过期
 *  - 500: 内部错误
 */
export async function POST(request: NextRequest) {
  const access = await getActiveSessionUser(await headers());
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const raw = typeof body.code === "string" ? body.code : "";
  const normalized = normalizeCode(raw);
  if (normalized.length !== CODE_LENGTH) {
    return NextResponse.json(
      { error: "Invalid code format" },
      { status: 400 },
    );
  }

  const result = await redeemCode({
    code: normalized,
    userId: access.user.id,
  });

  if (result.ok) {
    return NextResponse.json({
      success: true,
      creditsAdded: result.creditsAdded,
      newBalance: result.newBalance,
      channel: result.channel,
      batchId: result.batchId,
    });
  }

  switch (result.reason) {
    case "not_found":
      return NextResponse.json({ error: "Code not found" }, { status: 404 });
    case "already_used":
      return NextResponse.json(
        { error: "Code already used" },
        { status: 409 },
      );
    case "expired":
      return NextResponse.json({ error: "Code expired" }, { status: 410 });
    default:
      return NextResponse.json(
        { error: "Internal error" },
        { status: 500 },
      );
  }
}
