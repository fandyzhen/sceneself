import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { partnerApiKey } from "@/lib/db/schema";

export type PartnerApiKeyRow = typeof partnerApiKey.$inferSelect;

/**
 * 用 ISO 'YYYY-MM-DD' 表示"今天",用于 daily limit 重置逻辑。
 * 用 UTC 边界(与 db now() 时区无关,便于跨时区合作伙伴)。
 */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * 生成一对 API key:
 * - plaintext: 用户看到/复制的,格式 "sk_" + 32 字符 base64url(基本是 letters/digits/-_)
 * - hash: 存 DB 的 sha256 hex
 * - prefix: 前 8 个字符(plaintext 的前缀),用于 admin UI 识别
 */
export function generateApiKey(): {
  plaintext: string;
  hash: string;
  prefix: string;
} {
  const random = crypto.randomBytes(32).toString("base64url").slice(0, 32);
  const plaintext = `sk_${random}`;
  const hash = hashKey(plaintext);
  const prefix = plaintext.slice(0, 8);
  return { plaintext, hash, prefix };
}

/**
 * sha256 哈希(hex 编码)
 */
export function hashKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export type AuthFailReason = "invalid" | "deactivated" | "daily_limit_exceeded";

export type AuthenticateResult =
  | { ok: true; keyRow: PartnerApiKeyRow }
  | { ok: false; reason: AuthFailReason };

/**
 * 验证 API key + 限额检查 + 增计数(原子)
 *
 * 流程:
 * 1. SELECT key by hash
 * 2. 如未找到 → invalid
 * 3. 如 deactivated → deactivated
 * 4. 如 todayResetsAt != 今天 → 同步 reset codesToday=0 并把 todayResetsAt 设为今天(条件 UPDATE)
 * 5. 用条件 UPDATE 把 codesToday += count(仅当 codesToday + count <= dailyLimit),
 *    用 RETURNING 判断是否成功更新。失败 → daily_limit_exceeded
 *
 * 并发安全:第 5 步在 SQL 层用条件谓词保证不会超额。
 */
export async function authenticateAndConsume(
  plaintext: string,
  count: number,
  dbInstance: typeof db = db,
  now: Date = new Date(),
): Promise<AuthenticateResult> {
  if (!plaintext || typeof plaintext !== "string") {
    return { ok: false, reason: "invalid" };
  }
  if (!Number.isInteger(count) || count < 1) {
    return { ok: false, reason: "invalid" };
  }

  const hash = hashKey(plaintext);

  const rows = await dbInstance
    .select()
    .from(partnerApiKey)
    .where(eq(partnerApiKey.keyHash, hash))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  if (row.deactivated) return { ok: false, reason: "deactivated" };

  const today = todayIsoDate(now);

  // 如果 todayResetsAt 已过期,原子重置 codesToday=0
  if (row.todayResetsAt !== today) {
    await dbInstance
      .update(partnerApiKey)
      .set({ codesToday: 0, todayResetsAt: today })
      .where(
        and(
          eq(partnerApiKey.id, row.id),
          // 仅当 db 里仍是过期那一天才重置(避免并发覆盖)
          eq(partnerApiKey.todayResetsAt, row.todayResetsAt),
        ),
      );
    // 注意此时 row 是旧值;后续 atomic update 的谓词会读 db 最新值
  }

  // 原子 CAS-like update:codesToday + count <= dailyLimit 才更新
  const updated = await dbInstance
    .update(partnerApiKey)
    .set({
      codesToday: sql`${partnerApiKey.codesToday} + ${count}`,
      totalGenerated: sql`${partnerApiKey.totalGenerated} + ${count}`,
      lastUsedAt: now,
    })
    .where(
      and(
        eq(partnerApiKey.id, row.id),
        eq(partnerApiKey.deactivated, false),
        sql`${partnerApiKey.codesToday} + ${count} <= ${partnerApiKey.dailyLimit}`,
      ),
    )
    .returning();

  if (!updated[0]) {
    return { ok: false, reason: "daily_limit_exceeded" };
  }

  return { ok: true, keyRow: updated[0] };
}
