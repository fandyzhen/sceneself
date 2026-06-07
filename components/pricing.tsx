"use client";

import { IconCircleCheckFilled } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { getSubscriptionPlanDisplays } from "@/lib/billing-display";

export function Pricing() {
  const session = useSession();
  const router = useRouter();
  const t = useTranslations("pricing");
  const locale = useLocale();
  const userId = session.data?.user?.id;

  const plans = getSubscriptionPlanDisplays();

  const startCheckout = useCallback(
    async (key: string) => {
      if (!userId) {
        router.push(`/${locale}/signup`);
        return;
      }

      const res = await fetch("/api/payments/creem/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, kind: "subscription" }),
      });

      if (!res.ok) {
        return;
      }

      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    },
    [locale, router, userId]
  );

  return (
    <div className="relative">
      <div className="relative z-20 mx-auto mt-4 grid grid-cols-1 items-stretch gap-4 md:mt-20 md:grid-cols-3">
        {plans.map((plan) => {
          const deliveryKey =
            plan.cycle === "week"
              ? "details.weeklyDelivery"
              : plan.cycle === "month"
                ? "details.monthlyDelivery"
                : "details.yearlyDelivery";

          return (
            <div
              key={plan.id}
              className={cn(
                plan.featured
                  ? "relative border border-amber-300/40 bg-gradient-to-b from-amber-300/[0.10] to-stone-950/40 shadow-[0_30px_80px_-30px_rgba(245,178,120,0.4)] backdrop-blur-md"
                  : "bg-card",
                "flex h-full flex-col justify-between rounded-lg px-6 py-8 sm:mx-8 lg:mx-0"
              )}
            >
              {plan.featured ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-200 to-orange-300 px-3 py-1 text-xs font-semibold text-stone-900 shadow">
                  {t("popular")}
                </div>
              ) : null}
              <div>
                <h3
                  className={cn(
                    plan.featured ? "text-stone-50" : "text-muted-foreground",
                    "text-base font-semibold leading-7"
                  )}
                >
                  {t(`tiers.${plan.id}.name`)}
                </h3>
                <p className="mt-4">
                  <motion.span
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    key={plan.id}
                    className={cn(
                      "inline-block text-4xl font-bold tracking-tight",
                      plan.featured ? "text-stone-50" : "text-foreground"
                    )}
                  >
                    {plan.displayPrice}
                  </motion.span>
                  <span
                    className={cn(
                      "ml-2 text-sm",
                      plan.featured ? "text-stone-50/80" : "text-muted-foreground"
                    )}
                  >
                    {t(`tiers.${plan.id}.cadence`)}
                  </span>
                </p>
                <p
                  className={cn(
                    plan.featured ? "text-stone-50/80" : "text-muted-foreground",
                    "mt-3 text-sm font-medium"
                  )}
                >
                  {t("details.creditsPerCycle", { credits: plan.displayCredits })}
                </p>
                <p
                  className={cn(
                    plan.featured ? "text-stone-50/80" : "text-muted-foreground",
                    "mt-2 text-sm"
                  )}
                >
                  {t(deliveryKey)}
                </p>
                <p
                  className={cn(
                    plan.featured ? "text-stone-50/80" : "text-muted-foreground",
                    "mt-6 min-h-12 text-sm leading-7"
                  )}
                >
                  {t(`tiers.${plan.id}.description`)}
                </p>
                <ul
                  role="list"
                  className={cn(
                    plan.featured ? "text-stone-50/80" : "text-muted-foreground",
                    "mt-8 space-y-3 text-sm leading-6 sm:mt-10"
                  )}
                >
                  {(t.raw(`tiers.${plan.id}.features`) as string[]).map((feature) => (
                    <li key={feature} className="flex gap-x-3">
                      <IconCircleCheckFilled
                        className={cn(
                          plan.featured ? "text-stone-50" : "text-muted-foreground",
                          "h-6 w-5 flex-none"
                        )}
                        aria-hidden="true"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                onClick={() => startCheckout(plan.planKey)}
                className={cn(
                  plan.featured
                    ? "bg-gradient-to-r from-amber-200 to-orange-300 text-stone-900 shadow-sm hover:from-amber-300 hover:to-orange-400 focus-visible:outline-amber-300"
                    : "",
                  "mt-8 block w-full rounded-full px-3.5 py-2.5 text-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:mt-10"
                )}
              >
                {t(`tiers.${plan.id}.cta`)}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
