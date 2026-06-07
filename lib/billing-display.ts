import {
  PlanKey,
  RECOMMENDED_PLAN,
  subscriptionPlans,
} from "@/constants/billing";

// 三档 weekly/monthly/yearly 并列展示，月付高亮。
// 与 messages/{en,zh}.json 的 pricing.tiers.{weekly,monthly,yearly} 一一对应。
export const MARKETING_SUBSCRIPTION_TIERS = [
  { id: "weekly" as const, planKey: "weekly" as PlanKey },
  { id: "monthly" as const, planKey: "monthly" as PlanKey },
  { id: "yearly" as const, planKey: "yearly" as PlanKey },
] as const;

export type MarketingTierId = (typeof MARKETING_SUBSCRIPTION_TIERS)[number]["id"];

function formatUsdPrice(priceCents: number) {
  if (priceCents % 100 === 0) {
    return `$${(priceCents / 100).toFixed(0)}`;
  }
  return `$${(priceCents / 100).toFixed(2)}`;
}

function formatCredits(credits: number) {
  return new Intl.NumberFormat("en-US").format(credits);
}

export function getSubscriptionPlanDisplays() {
  return MARKETING_SUBSCRIPTION_TIERS.map((tier) => {
    const plan = subscriptionPlans[tier.planKey];
    return {
      id: tier.id,
      planKey: tier.planKey,
      plan,
      featured: tier.planKey === RECOMMENDED_PLAN,
      displayPrice: formatUsdPrice(plan.priceCents),
      displayCredits: formatCredits(plan.creditsPerCycle),
      cycle: plan.cycle,
    };
  });
}
