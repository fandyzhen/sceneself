import {
  isPackKey,
  isSubscriptionKey,
  oneTimePacks,
  RECOMMENDED_PLAN,
  subscriptionPlans,
} from "@/constants/billing";

describe("billing config", () => {
  it("exposes supported subscription keys", () => {
    expect(isSubscriptionKey("weekly")).toBe(true);
    expect(isSubscriptionKey("monthly")).toBe(true);
    expect(isSubscriptionKey("yearly")).toBe(true);
    expect(isSubscriptionKey("pack_200")).toBe(false);
  });

  it("rejects deprecated one-time pack keys (story-pack 已下线)", () => {
    expect(isPackKey("pack_200")).toBe(false);
    expect(isPackKey("monthly")).toBe(false);
  });

  it("oneTimePacks 为空记录（v3.1 起 story-pack 下线）", () => {
    expect(Object.keys(oneTimePacks)).toHaveLength(0);
  });

  it("三档订阅均为 per_cycle 一次性发放", () => {
    for (const plan of Object.values(subscriptionPlans)) {
      expect(plan.grantSchedule?.mode).toBe("per_cycle");
    }
  });

  it("三档 cycle 与 priceCents/credits 与 launch-todo 一致", () => {
    expect(subscriptionPlans.weekly.cycle).toBe("week");
    expect(subscriptionPlans.weekly.priceCents).toBe(990);
    expect(subscriptionPlans.weekly.creditsPerCycle).toBe(1500);

    expect(subscriptionPlans.monthly.cycle).toBe("month");
    expect(subscriptionPlans.monthly.priceCents).toBe(2900);
    expect(subscriptionPlans.monthly.creditsPerCycle).toBe(8000);

    expect(subscriptionPlans.yearly.cycle).toBe("year");
    expect(subscriptionPlans.yearly.priceCents).toBe(29900);
    expect(subscriptionPlans.yearly.creditsPerCycle).toBe(100000);
  });

  it("RECOMMENDED_PLAN 为月付", () => {
    expect(RECOMMENDED_PLAN).toBe("monthly");
  });
});
