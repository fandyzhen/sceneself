import {
  getSubscriptionPlanDisplays,
  MARKETING_SUBSCRIPTION_TIERS,
} from "@/lib/billing-display";

describe("MARKETING_SUBSCRIPTION_TIERS", () => {
  it("按 weekly/monthly/yearly 顺序展示三档订阅", () => {
    expect(MARKETING_SUBSCRIPTION_TIERS).toEqual([
      { id: "weekly", planKey: "weekly" },
      { id: "monthly", planKey: "monthly" },
      { id: "yearly", planKey: "yearly" },
    ]);
  });
});

describe("getSubscriptionPlanDisplays", () => {
  it("从 billing config 派生三档展示数据，月付高亮", () => {
    const displays = getSubscriptionPlanDisplays();
    expect(displays).toHaveLength(3);

    const [weekly, monthly, yearly] = displays;

    expect(weekly.id).toBe("weekly");
    expect(weekly.planKey).toBe("weekly");
    expect(weekly.featured).toBe(false);
    expect(weekly.displayPrice).toBe("$9.90");
    expect(weekly.displayCredits).toBe("1,500");
    expect(weekly.cycle).toBe("week");

    expect(monthly.id).toBe("monthly");
    expect(monthly.featured).toBe(true);
    expect(monthly.displayPrice).toBe("$29");
    expect(monthly.displayCredits).toBe("8,000");
    expect(monthly.cycle).toBe("month");

    expect(yearly.id).toBe("yearly");
    expect(yearly.featured).toBe(false);
    expect(yearly.displayPrice).toBe("$299");
    expect(yearly.displayCredits).toBe("100,000");
    expect(yearly.cycle).toBe("year");
  });
});
