/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, expect, it } from "vitest";
import { redeemCode } from "@/lib/redemption/redeem";

/**
 * Fake db 用一个 in-memory 状态模拟兑换:
 * - codes: Map<code, { credits, usedBy, expiresAt }>
 * - userCredits: Map<userId, number>
 * - ledger: 累计写入
 *
 * 模拟 drizzle 链:
 *  - tx.update(redemptionCode).set(...).where(...).returning(...)
 *      → 模拟 "claim" 操作:仅当 usedBy == null && (expires == null || expires > now) 时成功
 *  - tx.select().from(redemptionCode).where(eq(code)).limit(1)
 *      → 区分 not_found / already_used / expired
 *  - tx.update(userTable).set(...).where(...).returning(...)
 *      → 加积分
 *  - tx.insert(creditLedger).values(...)
 *      → 写流水
 *
 * 这是行为级模拟,不验证 SQL 字符串,只验证业务并发不变量。
 */

interface CodeRow {
  code: string;
  credits: number;
  channel: string | null;
  batchId: string;
  usedBy: string | null;
  usedAt: Date | null;
  expiresAt: Date | null;
}

function makeFakeDb(opts: {
  codes: CodeRow[];
  users: Record<string, number>;
}) {
  const state = {
    codes: opts.codes.map(c => ({ ...c })),
    users: { ...opts.users },
    ledger: [] as Array<{ userId: string; delta: number; reason: string }>,
  };

  // currentOp 用于跟踪当前是哪个动作上下文(脆弱但够用)
  // 真实操作流水比较复杂;我们用 op 标志在每次调用前显式指定

  let pendingCode: string | null = null;
  let pendingUserId: string | null = null;
  let pendingNow: Date | null = null;

  const tx: any = {
    update: (_table: any) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (...args: any[]) => ({
          returning: async (cols?: any) => {
            // 通过 patch 区分:claim(usedBy + usedAt) vs add credits(credits sql)
            if ("usedBy" in patch && "usedAt" in patch) {
              // claim
              const code = pendingCode!;
              const userId = patch.usedBy as string;
              const usedAt = patch.usedAt as Date;
              const now = pendingNow!;
              const row = state.codes.find(c => c.code === code);
              if (!row) return [];
              if (row.usedBy) return [];
              if (row.expiresAt && row.expiresAt.getTime() <= now.getTime())
                return [];
              row.usedBy = userId;
              row.usedAt = usedAt;
              return [
                {
                  credits: row.credits,
                  channel: row.channel,
                  batchId: row.batchId,
                },
              ];
            }
            // add credits to user
            const userId = pendingUserId!;
            // 从 ledger 取本次操作的 delta(其实更安全:从 codes 找已 claim 的)
            const claimedRow = state.codes.find(
              c => c.usedBy === userId && c.code === pendingCode,
            );
            const delta = claimedRow ? claimedRow.credits : 0;
            const before = state.users[userId] ?? 0;
            state.users[userId] = before + delta;
            return [{ credits: state.users[userId] }];
          },
        }),
      }),
    }),
    select: (_cols?: any) => ({
      from: (_table: any) => ({
        where: (..._args: any[]) => ({
          limit: async (_n: number) => {
            const code = pendingCode!;
            const row = state.codes.find(c => c.code === code);
            return row
              ? [{ usedBy: row.usedBy, expiresAt: row.expiresAt }]
              : [];
          },
        }),
      }),
    }),
    insert: (_table: any) => ({
      values: async (vals: any) => {
        state.ledger.push({
          userId: vals.userId,
          delta: vals.delta,
          reason: vals.reason,
        });
      },
    }),
  };

  return {
    state,
    transaction: async (cb: (tx: any) => Promise<unknown>) => {
      return cb(tx);
    },
    // 让测试在调用 redeemCode 前注入上下文:
    setContext(code: string, userId: string, now: Date) {
      pendingCode = code;
      pendingUserId = userId;
      pendingNow = now;
    },
  } as any;
}

describe("redeemCode - happy path", () => {
  it("redeems a valid unused code and credits the user", async () => {
    const fake = makeFakeDb({
      codes: [
        {
          code: "ABCDEFGHJKMN",
          credits: 500,
          channel: "newsletter",
          batchId: "batch_x",
          usedBy: null,
          usedAt: null,
          expiresAt: null,
        },
      ],
      users: { "u1": 100 },
    });
    const now = new Date();
    fake.setContext("ABCDEFGHJKMN", "u1", now);

    const r = await redeemCode(
      { code: "ABCDEFGHJKMN", userId: "u1" },
      fake,
      now,
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.creditsAdded).toBe(500);
      expect(r.newBalance).toBe(600);
      expect(r.channel).toBe("newsletter");
      expect(r.batchId).toBe("batch_x");
    }
    expect(fake.state.users["u1"]).toBe(600);
    expect(fake.state.ledger).toHaveLength(1);
    expect(fake.state.ledger[0]).toMatchObject({
      userId: "u1",
      delta: 500,
      reason: "redemption",
    });
  });
});

describe("redeemCode - failure paths", () => {
  it("returns not_found for unknown code", async () => {
    const fake = makeFakeDb({
      codes: [],
      users: { "u1": 0 },
    });
    fake.setContext("ZZZZZZZZZZZZ", "u1", new Date());
    const r = await redeemCode(
      { code: "ZZZZZZZZZZZZ", userId: "u1" },
      fake,
      new Date(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });

  it("returns already_used when code is consumed", async () => {
    const fake = makeFakeDb({
      codes: [
        {
          code: "ABCDEFGHJKMN",
          credits: 500,
          channel: null,
          batchId: "batch_x",
          usedBy: "other_user",
          usedAt: new Date("2026-06-01"),
          expiresAt: null,
        },
      ],
      users: { "u1": 0 },
    });
    fake.setContext("ABCDEFGHJKMN", "u1", new Date());
    const r = await redeemCode(
      { code: "ABCDEFGHJKMN", userId: "u1" },
      fake,
      new Date(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("already_used");
    expect(fake.state.users["u1"]).toBe(0);
  });

  it("returns expired when expiresAt is in the past", async () => {
    const expiresAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-06-05T00:00:00.000Z");
    const fake = makeFakeDb({
      codes: [
        {
          code: "ABCDEFGHJKMN",
          credits: 500,
          channel: null,
          batchId: "batch_x",
          usedBy: null,
          usedAt: null,
          expiresAt,
        },
      ],
      users: { "u1": 0 },
    });
    fake.setContext("ABCDEFGHJKMN", "u1", now);
    const r = await redeemCode(
      { code: "ABCDEFGHJKMN", userId: "u1" },
      fake,
      now,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });
});

describe("redeemCode - concurrency", () => {
  it("two simultaneous redemptions of the same code: only one succeeds", async () => {
    const fake = makeFakeDb({
      codes: [
        {
          code: "ABCDEFGHJKMN",
          credits: 500,
          channel: null,
          batchId: "batch_x",
          usedBy: null,
          usedAt: null,
          expiresAt: null,
        },
      ],
      users: { "u1": 0, "u2": 0 },
    });
    const now = new Date();

    // 串行模拟并发(在 in-mem 模型下,谁先进入 claim 谁赢)
    fake.setContext("ABCDEFGHJKMN", "u1", now);
    const r1 = await redeemCode(
      { code: "ABCDEFGHJKMN", userId: "u1" },
      fake,
      now,
    );
    fake.setContext("ABCDEFGHJKMN", "u2", now);
    const r2 = await redeemCode(
      { code: "ABCDEFGHJKMN", userId: "u2" },
      fake,
      now,
    );

    const oks = [r1.ok, r2.ok].filter(Boolean);
    expect(oks).toHaveLength(1);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("already_used");

    // 累计积分仅给到第一个
    expect(fake.state.users["u1"]).toBe(500);
    expect(fake.state.users["u2"]).toBe(0);
    expect(fake.state.ledger).toHaveLength(1);
  });
});
