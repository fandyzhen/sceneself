import "server-only"; // 防止此文件被 client component 引入(会拉 postgres → fs/os bundle 错)
import crypto from "crypto";
import { db } from "@/lib/db";
import { redemptionCode } from "@/lib/db/schema";
import { ALPHABET, CODE_LENGTH } from "./code-utils";

// 重导出 client-safe utils,保持 codes.ts 现有 server 端调用方零改动
export { ALPHABET, CODE_LENGTH, normalizeCode, formatCode, formatVisualCode } from "./code-utils";

/**
 * 生成一个 12 位随机兑换码(大写)。使用 crypto.randomBytes 保证不可预测。
 * 仅服务端可用(用 node crypto)。
 */
export function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return s;
}

export interface GenerateBatchOptions {
  count: number;
  credits: number;
  channel?: string;
  createdBy: string; // 'admin' 或 partnerId
  expiresAt?: Date | null;
}

export interface GenerateBatchResult {
  batchId: string;
  codes: string[];
}

/**
 * 生成一个 batchId(简单加 nanoid 风格)
 */
function makeBatchId(): string {
  // 8 位随机
  return `batch_${crypto.randomBytes(6).toString("base64url").slice(0, 8)}`;
}

/**
 * 批量生成 + 写入 DB。
 * 遇到 unique 冲突时,对失败的码重试(理论极少发生:31^12 ≈ 7.9e17)。
 */
export async function generateBatch(
  opts: GenerateBatchOptions,
  dbInstance: typeof db = db,
): Promise<GenerateBatchResult> {
  const { count, credits, channel, createdBy, expiresAt } = opts;

  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error("count must be an integer in [1, 500]");
  }
  if (!Number.isInteger(credits) || credits < 1) {
    throw new Error("credits must be a positive integer");
  }
  if (!createdBy) {
    throw new Error("createdBy is required");
  }

  const batchId = makeBatchId();
  const created: string[] = [];
  const MAX_RETRIES = 5;
  let attempts = 0;

  while (created.length < count) {
    if (attempts++ > MAX_RETRIES) {
      throw new Error(
        `Failed to generate unique codes after ${MAX_RETRIES} attempts (created ${created.length}/${count})`,
      );
    }

    const remaining = count - created.length;
    // 多生成一些以减少二次冲突的几率
    const pool = new Set<string>();
    while (pool.size < remaining) {
      pool.add(generateCode());
    }
    const newCodes = Array.from(pool);

    const rows = newCodes.map(code => ({
      code,
      batchId,
      credits,
      channel: channel ?? null,
      createdBy,
      expiresAt: expiresAt ?? null,
    }));

    try {
      // PG 支持 ON CONFLICT DO NOTHING + RETURNING,这样冲突的不被插入
      const inserted = await dbInstance
        .insert(redemptionCode)
        .values(rows)
        .onConflictDoNothing({ target: redemptionCode.code })
        .returning({ code: redemptionCode.code });

      for (const r of inserted) created.push(r.code);
    } catch (err) {
      // 极端情况:其他错误直接抛出
      throw err;
    }
  }

  return { batchId, codes: created };
}
