"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { getSubscriptionPlanDisplays } from "@/lib/billing-display";

type ComparisonCell = string;

export function PricingTable() {
  const t = useTranslations("pricing");
  const plans = getSubscriptionPlanDisplays();

  const tiers = plans.map((plan) => ({
    id: plan.id,
    name: t(`tiers.${plan.id}.name`),
    featured: plan.featured,
  }));

  const purchaseTypeValue = (cycle: "week" | "month" | "year") =>
    t(`comparison.values.${cycle === "week" ? "weekly" : cycle === "month" ? "monthly" : "yearly"}`);

  const bestForKey = (id: string) =>
    id === "weekly"
      ? "comparison.values.bestForWeekly"
      : id === "monthly"
        ? "comparison.values.bestForMonthly"
        : "comparison.values.bestForYearly";

  const tableRows: Array<{
    title: string;
    values: Record<string, ComparisonCell>;
  }> = [
    {
      title: t("comparison.rows.purchaseType"),
      values: Object.fromEntries(plans.map((plan) => [plan.id, purchaseTypeValue(plan.cycle)])),
    },
    {
      title: t("comparison.rows.price"),
      values: Object.fromEntries(plans.map((plan) => [plan.id, plan.displayPrice])),
    },
    {
      title: t("comparison.rows.credits"),
      values: Object.fromEntries(plans.map((plan) => [plan.id, plan.displayCredits])),
    },
    {
      title: t("comparison.rows.delivery"),
      values: Object.fromEntries(plans.map((plan) => [plan.id, t("comparison.values.instantAfterPayment")])),
    },
    {
      title: t("comparison.rows.watermark"),
      values: Object.fromEntries(plans.map((plan) => [plan.id, t("comparison.values.watermarkRemoved")])),
    },
    {
      title: t("comparison.rows.bestFor"),
      values: Object.fromEntries(plans.map((plan) => [plan.id, t(bestForKey(plan.id))])),
    },
  ];

  return (
    <div className="relative z-20 mx-auto w-full px-4 py-40">
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr>
                  <th className="max-w-xs py-3.5 pl-4 pr-3 text-left text-3xl font-extrabold text-foreground sm:pl-0" />
                  {tiers.map((tier) => (
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-center text-lg font-semibold text-foreground"
                      key={tier.id}
                    >
                      {tier.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tableRows.map((row) => (
                  <tr key={row.title}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-foreground sm:pl-0">
                      {row.title}
                    </td>
                    {tiers.map((tier) => (
                      <td
                        key={`${row.title}-${tier.id}`}
                        className="whitespace-nowrap px-3 py-4 text-center text-sm text-muted-foreground"
                      >
                        {row.values[tier.id]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
