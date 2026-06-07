"use client";

// 首页主结构(v3):
//   ① CinemaStripHero — 3 行胶片墙 + 中央浮层(独立文件,复杂)
//   ② HowStrip       — 紧凑 3 步(纯文字 + line icon,不再用大手机 mockup)
//   ③ ScenesGrid     — 8 类故事线大卡(每卡一张真实素材图覆盖)
//   ④ TrustStrip     — 3 条隐私承诺(单行)
//   ⑤ PricingTease   — 3 档卡(轻量,跳 /pricing 看详情)
//   ⑥ FinalCTA       — 大字 + amber 按钮收尾
//
// 设计语言:Fraunces italic display + stone-950 暗底 + amber-200/300 高光 + grain noise +
// 行内 amber 微光,与 CinemaStripHero 一脉相承。

import { useLocale, useTranslations } from "next-intl";
import { Fraunces } from "next/font/google";
import { motion } from "framer-motion";
import { ArrowRight, Camera, PenLine, Sparkles, ShieldCheck, Trash2, Lock, Check } from "lucide-react";
import { CinemaStripHero } from "./cinema-strip-hero";
import { SHOWCASE_SETS } from "@/lib/landing/showcase-sets";
import type { ShowcaseSet } from "@/lib/landing/showcase-sets";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")";

// 8 类 storyline 各取一张代表图(从 SHOWCASE_SETS 按 storyline 字段索引)。
// 注意:数据里 storyline 重复时(如 profession 出现 2 次)优先取第一个。
const STORYLINE_KEYS = [
  "journey",
  "fantasy_role",
  "profession",
  "ownership_flex",
  "milestone_event",
  "seasonal",
  "transformation",
  "lifestyle",
] as const;

function firstSetByStoryline(key: typeof STORYLINE_KEYS[number]): ShowcaseSet | undefined {
  return SHOWCASE_SETS.find(s => s.storyline === key);
}

export function SceneLanding() {
  return (
    <div className="relative bg-stone-950 text-stone-100">
      <CinemaStripHero />
      <HowStrip />
      <ScenesGrid />
      <TrustStrip />
      <PricingTease />
      <FinalCTA />
    </div>
  );
}

// ───────────────────────── HowStrip ─────────────────────────
function HowStrip() {
  const t = useTranslations("scene.landing");
  const steps = [
    { icon: Camera, k: "s1" },
    { icon: PenLine, k: "s2" },
    { icon: Sparkles, k: "s3" },
  ];
  return (
    <section className="relative border-t border-amber-200/[0.08] bg-stone-950 py-20 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-200/75">
            <span className="block h-px w-8 bg-amber-200/40" /> {t("how.kicker")}
          </span>
          <h2 className={`${display.className} mt-4 text-[2.2rem] font-medium leading-[1.05] sm:text-[3.2rem]`}>
            {t("how.title")}
          </h2>
        </div>
        <div className="mt-12 grid gap-8 sm:mt-16 sm:grid-cols-3 sm:gap-10">
          {steps.map((s, i) => (
            <motion.div
              key={s.k}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, delay: i * 0.08 }}
              className="relative"
            >
              <div className="flex items-baseline gap-4">
                <span className={`${display.className} text-[3.2rem] italic font-medium text-amber-300/35 leading-none`}>
                  {`0${i + 1}`}
                </span>
                <s.icon className="h-5 w-5 text-amber-200/80" strokeWidth={1.5} />
              </div>
              <h3 className="mt-4 text-lg font-medium text-stone-100 sm:text-xl">{t(`how.${s.k}`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-400 sm:text-base">{t(`how.${s.k}d`)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── ScenesGrid (8 类世界) ─────────────────────────
function ScenesGrid() {
  const t = useTranslations("scene.landing");
  const locale = useLocale();
  const createHref = locale === "en" ? "/create" : `/${locale}/create`;
  return (
    <section className="relative border-t border-amber-200/[0.08] bg-stone-950 py-20 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute -top-40 right-0 h-[40vh] w-[60vh] bg-[radial-gradient(closest-side,rgba(245,178,120,0.10),transparent)]" />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-200/75">
            <span className="block h-px w-8 bg-amber-200/40" /> {t("scenes.kicker")}
          </span>
          <h2 className={`${display.className} mt-4 text-[2.2rem] font-medium leading-[1.05] sm:text-[3.4rem]`}>
            {t("scenes.title")}
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-orange-300 to-amber-200 bg-clip-text italic text-transparent">
              {t("scenes.titleAccent")}
            </span>
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-stone-400 sm:text-base">{t("scenes.sub")}</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-3 sm:mt-16 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {STORYLINE_KEYS.map((key, i) => {
            const set = firstSetByStoryline(key);
            const cover = set?.images[0];
            const second = set?.images[3] ?? set?.images[1]; // hover 切第二张
            return (
              <motion.a
                key={key}
                href={createHref}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: (i % 4) * 0.06 }}
                className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-amber-200/[0.06] bg-stone-900"
              >
                {cover && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-[800ms] group-hover:scale-[1.08]"
                    />
                    {/* hover 时切第二张 → 让用户感觉"一组多张"的暗示 */}
                    {second && second !== cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={second}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      />
                    )}
                  </>
                )}
                {/* 底部渐变 + 文字 */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950 via-stone-950/60 to-transparent px-5 pb-5 pt-16">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">
                    {t(`scenes.types.${key}.label`)}
                  </p>
                  <p className={`${display.className} mt-1.5 text-[1.3rem] leading-tight text-stone-100 italic`}>
                    &ldquo;{t(`scenes.types.${key}.prompt`)}&rdquo;
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs text-amber-200/80 opacity-0 transition-opacity group-hover:opacity-100">
                    {t("scenes.tryThis")} <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
                {/* 角标:6 张提示 */}
                <span className="absolute right-3 top-3 rounded-full border border-amber-200/30 bg-stone-950/50 px-2.5 py-1 text-[10px] font-medium text-amber-100/90 backdrop-blur">
                  {t("scenes.sixShots")}
                </span>
              </motion.a>
            );
          })}
        </div>

        <div className="mt-12 text-center sm:mt-16">
          <a
            href={createHref}
            className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-stone-950/30 px-7 py-3.5 text-sm font-medium text-stone-100 backdrop-blur transition hover:border-amber-200/60 hover:bg-stone-950/60"
          >
            {t("scenes.tryYourOwn")} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── TrustStrip ─────────────────────────
function TrustStrip() {
  const t = useTranslations("scene.landing");
  const items = [
    { icon: Trash2, k: "delete" },
    { icon: ShieldCheck, k: "noTrain" },
    { icon: Lock, k: "encrypted" },
  ];
  return (
    <section className="relative border-t border-amber-200/[0.08] bg-stone-950/60 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-6 sm:grid-cols-3 sm:gap-10">
          {items.map(({ icon: Icon, k }) => (
            <div key={k} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-200/80" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-medium text-stone-100">{t(`trust.${k}.title`)}</p>
                <p className="mt-1 text-xs leading-relaxed text-stone-400 sm:text-[13px]">{t(`trust.${k}.sub`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── PricingTease ─────────────────────────
function PricingTease() {
  const t = useTranslations("scene.landing");
  const locale = useLocale();
  const pricingHref = locale === "en" ? "/pricing" : `/${locale}/pricing`;
  const tiers = [
    { k: "weekly", price: "$2.99", period: t("pricing.perWeek"), highlight: false },
    { k: "monthly", price: "$9.90", period: t("pricing.perMonth"), highlight: true },
    { k: "yearly", price: "$99", period: t("pricing.perYear"), highlight: false },
  ];
  return (
    <section className="relative border-t border-amber-200/[0.08] bg-stone-950 py-20 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute -top-32 left-0 h-[40vh] w-[60vh] bg-[radial-gradient(closest-side,rgba(245,178,120,0.08),transparent)]" />
      <div className="relative mx-auto max-w-5xl px-5 sm:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-200/75">
            <span className="block h-px w-8 bg-amber-200/40" /> {t("pricing.kicker")}
            <span className="block h-px w-8 bg-amber-200/40" />
          </span>
          <h2 className={`${display.className} mt-4 text-[2rem] font-medium leading-[1.1] sm:text-[3rem]`}>
            {t("pricing.title")}
          </h2>
        </div>
        <div className="mt-12 grid gap-4 sm:mt-14 sm:grid-cols-3">
          {tiers.map(tier => (
            <motion.div
              key={tier.k}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className={`relative rounded-3xl border p-7 backdrop-blur-md transition ${
                tier.highlight
                  ? "border-amber-300/40 bg-gradient-to-b from-amber-300/[0.06] to-stone-950/40 shadow-[0_30px_80px_-30px_rgba(245,178,120,0.4)]"
                  : "border-amber-200/[0.08] bg-stone-950/40 hover:border-amber-200/20"
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-200 to-orange-300 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-900">
                  {t("pricing.popular")}
                </span>
              )}
              <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200/70">{t(`pricing.tiers.${tier.k}.label`)}</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className={`${display.className} text-[2.5rem] font-medium`}>{tier.price}</span>
                <span className="text-xs text-stone-500">{tier.period}</span>
              </div>
              <p className="mt-2 text-sm text-stone-400">{t(`pricing.tiers.${tier.k}.credits`)}</p>
              <ul className="mt-5 space-y-2 text-[13px] text-stone-300">
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-300/80" /> {t(`pricing.tiers.${tier.k}.f1`)}</li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-300/80" /> {t(`pricing.tiers.${tier.k}.f2`)}</li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-300/80" /> {t(`pricing.tiers.${tier.k}.f3`)}</li>
              </ul>
              <a
                href={pricingHref}
                className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition ${
                  tier.highlight
                    ? "bg-gradient-to-r from-amber-200 to-orange-300 text-stone-900 hover:brightness-105"
                    : "border border-amber-200/20 text-stone-100 hover:border-amber-200/50 hover:bg-stone-950/60"
                }`}
              >
                {t("pricing.choose")}
              </a>
            </motion.div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-stone-500">{t("pricing.detailsLink")} <a href={pricingHref} className="text-amber-200/80 underline-offset-4 hover:underline">{t("pricing.detailsCta")}</a></p>
      </div>
    </section>
  );
}

// ───────────────────────── FinalCTA ─────────────────────────
function FinalCTA() {
  const t = useTranslations("scene.landing");
  const locale = useLocale();
  const createHref = locale === "en" ? "/create" : `/${locale}/create`;
  return (
    <section className="relative overflow-hidden border-t border-amber-200/[0.08] bg-stone-950 py-28 sm:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,rgba(245,178,120,0.16),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className={`${display.className} text-[2.6rem] font-medium leading-[1] sm:text-[5rem]`}>
            {t("finalCta.titleA")}
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-orange-300 to-amber-200 bg-clip-text italic text-transparent">
              {t("finalCta.titleB")}
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-stone-400 sm:text-lg">{t("finalCta.sub")}</p>
          <a
            href={createHref}
            className="group mt-10 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-200 to-orange-300 px-9 py-5 text-base font-semibold text-stone-900 shadow-[0_15px_50px_-12px_rgba(245,178,120,0.6)] transition hover:brightness-105"
          >
            <Sparkles className="h-4 w-4" />
            {t("finalCta.button")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <p className="mt-5 text-xs text-stone-500">{t("finalCta.trust")}</p>
        </motion.div>
      </div>
    </section>
  );
}
