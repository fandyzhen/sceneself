export type BillingKind = "subscription" | "one_time";

// 三档订阅（launch-todo §1.1）：周/月/年，均 per_cycle 一次性发放。
export type PlanKey = "weekly" | "monthly" | "yearly";

// story-pack 已下线（SPEC v3.1）。保留 PackKey 类型以兼容现有调用方，
// 但 oneTimePacks 为空记录，isPackKey 恒返回 false。
export type PackKey = never;

export type GrantScheduleConfig =
  | {
      mode: "per_cycle";
    }
  | {
      mode: "installments";
      grantsPerCycle: number;
      intervalMonths: number;
      creditsPerGrant?: number;
      initialGrants?: number;
    };

type SubscriptionPlan = {
  key: PlanKey;
  kind: "subscription";
  priceCents: number;
  currency: "usd";
  creditsPerCycle: number;
  cycle: "week" | "month" | "year";
  // Creem 后台建好对应订阅产品后，把 priceId 写入环境变量。
  creemPriceId?: string;
  grantSchedule?: GrantScheduleConfig;
};

type OneTimePack = {
  key: PackKey;
  kind: "one_time";
  priceCents: number;
  currency: "usd";
  credits: number;
  creemPriceId?: string;
};

// 月付为推荐档（在定价页高亮"最受欢迎"）。
export const RECOMMENDED_PLAN: PlanKey = "monthly";

export const subscriptionPlans: Record<PlanKey, SubscriptionPlan> = {
  weekly: {
    key: "weekly",
    kind: "subscription",
    priceCents: 990,
    currency: "usd",
    creditsPerCycle: 1500,
    cycle: "week",
    creemPriceId: process.env.CREEM_WEEKLY_PRICE_ID,
    grantSchedule: { mode: "per_cycle" },
  },
  monthly: {
    key: "monthly",
    kind: "subscription",
    priceCents: 2900,
    currency: "usd",
    creditsPerCycle: 8000,
    cycle: "month",
    creemPriceId: process.env.CREEM_MONTHLY_PRICE_ID,
    grantSchedule: { mode: "per_cycle" },
  },
  yearly: {
    key: "yearly",
    kind: "subscription",
    priceCents: 29900,
    currency: "usd",
    creditsPerCycle: 100000,
    cycle: "year",
    creemPriceId: process.env.CREEM_YEARLY_PRICE_ID,
    grantSchedule: { mode: "per_cycle" },
  },
};

// story-pack 下线后 oneTimePacks 为空记录。
// Record<never, T> 在 TS 中等价于空对象类型，禁止任何 key。
export const oneTimePacks: Record<PackKey, OneTimePack> = {} as Record<PackKey, OneTimePack>;

export function isSubscriptionKey(key: string): key is PlanKey {
  return (key as PlanKey) in subscriptionPlans;
}

export function isPackKey(key: string): key is PackKey {
  return key in oneTimePacks;
}
