import { Pricing } from "@/components/pricing";
import { PricingTable } from "./pricing-table";
import { ScenePageShell } from "@/components/scene-chrome/scene-page-shell";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n.config";
import { generatePageMetadata } from "@/lib/metadata";
import { Fraunces } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], weight: ["500", "600", "900"], style: ["italic", "normal"], display: "swap" });

export async function generateMetadata(
  props: { params: Promise<{ locale: Locale }> },
): Promise<Metadata> {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: "pricing" });
  return generatePageMetadata({
    locale: params.locale,
    path: "/pricing",
    title: t("title"),
    description: t("subtitle"),
  });
}

// 删了旧模板的 Background / Heading / Subheading / Companies 装饰组件,
// 用 ScenePageShell 提供品牌一致的暗背景 + grain + amber glow,标题用 Fraunces italic。
// Pricing / PricingTable 内部已使用 token-based 配色(bg-card/text-foreground),
// 在 marketing-chrome 的 dark 包裹下会自动取暗值,跟首页一脉相承。
export default async function PricingPage(
  props: { params: Promise<{ locale: Locale }> },
) {
  const params = await props.params;
  const { locale } = params;
  const t = await getTranslations({ locale, namespace: "pricing" });

  return (
    <ScenePageShell>
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20">
        <header className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-200/75">
            <span className="block h-px w-8 bg-amber-200/40" />
            {t("title")}
            <span className="block h-px w-8 bg-amber-200/40" />
          </span>
          <h1 className={`${display.className} mt-5 text-[2.4rem] font-medium leading-[1.05] sm:text-[3.6rem]`}>
            {t("subtitle")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-stone-400 sm:text-base">
            {t("description")}
          </p>
        </header>

        <div className="mt-12 sm:mt-16">
          <Pricing />
        </div>

        <div className="mt-12 sm:mt-16">
          <PricingTable />
        </div>
      </div>
    </ScenePageShell>
  );
}
