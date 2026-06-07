/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  authenticateAndConsume,
  generateApiKey,
  hashKey,
  todayIsoDate,
} from "@/lib/redemption/api-keys";

describe("api-keys - generateApiKey", () => {
  it("returns plaintext with sk_ prefix and 35 total chars", () => {
    const { plaintext, hash, prefix } = generateApiKey();
    expect(plaintext.startsWith("sk_")).toBe(true);
    expect(plaintext).toHaveLength(35); // 'sk_' + 32 chars
    expect(prefix).toBe(plaintext.slice(0, 8));
    expect(prefix).toHaveLength(8);
    // hash 是 sha256 hex = 64 chars
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it("hash is sha256 of plaintext", () => {
    const { plaintext, hash } = generateApiKey();
    const recomputed = crypto
      .createHash("sha256")
      .update(plaintext)
      .digest("hex");
    expect(hash).toBe(recomputed);
  });

  it("hashKey is deterministic and same as generateApiKey output", () => {
    expect(hashKey("sk_test")).toBe(hashKey("sk_test"));
    expect(hashKey("sk_test")).not.toBe(hashKey("sk_other"));
  });
});

describe("api-keys - todayIsoDate", () => {
  it("returns YYYY-MM-DD UTC slice", () => {
    const d = new Date("2026-06-05T22:14:00.000Z");
    expect(todayIsoDate(d)).toBe("2026-06-05");
  });
});

/**
 * authenticateAndConsume 用一个最小 fake db 模拟:
 * - select.from.where.limit() → 返回 [state] 或 []
 * - update.set(patch).where().returning() → 模拟 reset 与 consume 两条路径
 *
 * 由于 drizzle 的 sql 模板里 `codesToday + ${count} <= dailyLimit` 是个 SQL 表达式,
 * fake 拿不到 count 参数。所以我们在 fake 上挂一个 `consumeAmount` 字段
 * 让测试用例显式声明要消费的额度。
 */

type Row = {
  id: string;
  keyHash: string;
  deactivated: boolean;
  todayResetsAt: string;
  codesToday: number;
  dailyLimit: number;
  totalGenerated: number;
};

function makeFakeDb(initial: Row | null) {
  const fake: any = {
    state: initial ? { ...initial } : null,
    consumeAmount: 0,
  };

  fake.select = () => ({
    from: () => ({
      where: () => ({
        limit: async (_n: number) =>
          fake.state ? [{ ...fake.state }] : [],
      }),
    }),
  });

  fake.update = () => ({
    set: (patch: Record<string, unknown>) => {
      // 这一步要返回一个对象,既可 .where(...).returning() 也可直接 await
      const applyMutation = () => {
        if (!fake.state) return [];

        const isConsume =
          "lastUsedAt" in patch || "totalGenerated" in patch;

        if (isConsume) {
          const want = fake.consumeAmount as number;
          if (fake.state.codesToday + want > fake.state.dailyLimit) {
            return [];
          }
          fake.state.codesToday += want;
          fake.state.totalGenerated += want;
          return [{ ...fake.state }];
        }

        // reset 路径
        if ("codesToday" in patch)
          fake.state.codesToday = patch.codesToday as number;
        if ("todayResetsAt" in patch)
          fake.state.todayResetsAt = patch.todayResetsAt as string;
        return [{ ...fake.state }];
      };

      const whereChain = {
        returning: async () => applyMutation(),
        // 让 `await update().set().where()` 也可工作(reset 路径)
        then: (resolve: (val: unknown) => void) => resolve(applyMutation()),
      };

      return { where: () => whereChain };
    },
  });

  return fake;
}

describe("api-keys - authenticateAndConsume", () => {
  it("returns invalid when key not found", async () => {
    const fake: any = makeFakeDb(null);
    const r = await authenticateAndConsume("sk_nope", 5, fake);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid");
  });

  it("returns invalid for falsy inputs", async () => {
    const fake = makeFakeDb(null);
    const r1 = await authenticateAndConsume("", 5, fake);
    expect(r1.ok).toBe(false);
    const r2 = await authenticateAndConsume("sk_x", 0, fake);
    expect(r2.ok).toBe(false);
  });

  it("returns deactivated when row.deactivated is true", async () => {
    const fake: any = makeFakeDb({
      id: "p1",
      keyHash: hashKey("sk_abc"),
      deactivated: true,
      todayResetsAt: todayIsoDate(),
      codesToday: 0,
      dailyLimit: 100,
      totalGenerated: 0,
    });
    const r = await authenticateAndConsume("sk_abc", 5, fake);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("deactivated");
  });

  it("returns daily_limit_exceeded when codesToday + count > dailyLimit", async () => {
    const fake: any = makeFakeDb({
      id: "p1",
      keyHash: hashKey("sk_abc"),
      deactivated: false,
      todayResetsAt: todayIsoDate(),
      codesToday: 99,
      dailyLimit: 100,
      totalGenerated: 0,
    });
    fake.consumeAmount = 5;
    const r = await authenticateAndConsume("sk_abc", 5, fake);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("daily_limit_exceeded");
  });

  it("succeeds and bumps counters", async () => {
    const fake: any = makeFakeDb({
      id: "p1",
      keyHash: hashKey("sk_abc"),
      deactivated: false,
      todayResetsAt: todayIsoDate(),
      codesToday: 10,
      dailyLimit: 100,
      totalGenerated: 50,
    });
    fake.consumeAmount = 7;
    const r = await authenticateAndConsume("sk_abc", 7, fake);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keyRow.codesToday).toBe(17);
      expect(r.keyRow.totalGenerated).toBe(57);
    }
  });

  it("resets codesToday when todayResetsAt is stale", async () => {
    const stale = "2026-01-01";
    const fake: any = makeFakeDb({
      id: "p1",
      keyHash: hashKey("sk_abc"),
      deactivated: false,
      todayResetsAt: stale,
      codesToday: 999,
      dailyLimit: 100,
      totalGenerated: 0,
    });
    fake.consumeAmount = 5;
    const now = new Date("2026-06-05T00:00:00.000Z");
    const r = await authenticateAndConsume("sk_abc", 5, fake, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 在 reset 之后 codesToday 应该是 5,而不是 999+5
      expect(r.keyRow.codesToday).toBe(5);
      expect(r.keyRow.todayResetsAt).toBe("2026-06-05");
    }
  });
});
