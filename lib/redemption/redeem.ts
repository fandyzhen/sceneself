import { randomUUID } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditLedger, redemptionCode, user as userTable } from "@/lib/db/schema";

export type RedeemFailReason =
  | "not_found"
  | "already_used"
  | "expired"
  | "internal_error";

export type RedeemResult =
  | {
      ok: true;
      creditsAdded: number;
      newBalance: number;
      channel: string | null;
      batchId: string;
    }
  | { ok: false; reason: RedeemFailReason };

/**
 * 兑换一个 code。
 *
 * 并发安全:
 * - 用 atomic UPDATE WHERE used_by IS NULL RETURNING; 若 affectedRows=0,
 *   则要么码不存在,要么已被用 — 再 SELECT 区分两种情况。
 * - 整个操作放在 db.transaction 里:把 redemption 标记 + 加积分 + 写 ledger 原子化。
 *
 * 现暂不实现过期 (expires_at 字段保留作未来)。
 */
export async function redeemCode(
  input: { code: string; userId: string },
  dbInstance: typeof db = db,
  now: Date = new Date(),
): Promise<RedeemResult> {
  const { code, userId } = input;

  if (!code || !userId) {
    return { ok: false, reason: "not_found" };
  }

  try {
    return await dbInstance.transaction(async tx => {
      // 1. atomic claim: 只更新还没被用、且未过期的码
      const claimed = await tx
        .update(redemptionCode)
        .set({ usedBy: userId, usedAt: now })
        .where(
          and(
            eq(redemptionCode.code, code),
            isNull(redemptionCode.usedBy),
            // expires_at IS NULL OR expires_at > now() — 用 db NOW() 避免 JS Date.toString() 非 ISO 被 pg 拒
            sql`(${redemptionCode.expiresAt} IS NULL OR ${redemptionCode.expiresAt} > NOW())`,
          ),
        )
        .returning({
          credits: redemptionCode.credits,
          channel: redemptionCode.channel,
          batchId: redemptionCode.batchId,
        });

      const row = claimed[0];
      if (!row) {
        // 区分:不存在 / 已用 / 过期
        const existing = await tx
          .select({
            usedBy: redemptionCode.usedBy,
            expiresAt: redemptionCode.expiresAt,
          })
          .from(redemptionCode)
          .where(eq(redemptionCode.code, code))
          .limit(1);

        if (!existing[0]) return { ok: false, reason: "not_found" } as const;
        if (existing[0].usedBy)
          return { ok: false, reason: "already_used" } as const;
        if (
          existing[0].expiresAt &&
          existing[0].expiresAt.getTime() <= now.getTime()
        )
          return { ok: false, reason: "expired" } as const;
        // 兜底
        return { ok: false, reason: "already_used" } as const;
      }

      // 2. 加积分到 user.credits
      const updatedUsers = await tx
        .update(userTable)
        .set({ credits: sql`${userTable.credits} + ${row.credits}` })
        .where(eq(userTable.id, userId))
        .returning({ credits: userTable.credits });

      const newBalance = updatedUsers[0]?.credits ?? 0;

      // 3. 写 credit_ledger
      await tx.insert(creditLedger).values({
        id: randomUUID(),
        userId,
        delta: row.credits,
        reason: "redemption",
        paymentId: null,
      });

      return {
        ok: true,
        creditsAdded: row.credits,
        newBalance,
        channel: row.channel ?? null,
        batchId: row.batchId,
      } as const;
    });
  } catch (err) {
    console.error("[redeemCode] error:", err);
    return { ok: false, reason: "internal_error" };
  }
}
