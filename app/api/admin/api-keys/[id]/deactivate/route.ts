import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getActiveSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { partnerApiKey } from "@/lib/db/schema";

/**
 * POST /api/admin/api-keys/[id]/deactivate
 * 撤销一个 API key(软撤销,保留 audit)。
 */
export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string }> },
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

  const updated = await db
    .update(partnerApiKey)
    .set({ deactivated: true })
    .where(eq(partnerApiKey.id, params.id))
    .returning({ id: partnerApiKey.id });

  if (!updated[0]) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
