"use client";

// SceneFooter — 品牌统一的全局页脚。
// 风格:暗 stone-950 + amber 微光 + Fraunces logo,与 SceneNavBar 呼应。
// 4 列:品牌 + 主导航 + 法律 + Newsletter。底部小字版权。

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Fraunces } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], weight: ["500", "600"], style: ["italic", "normal"], display: "swap" });

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")";

export function SceneFooter() {
  const t = useTranslations();
  const locale = useLocale();
  const href = (p: string) => (locale === "en" ? p : `/${locale}${p}`);

  const product = [
    { label: t("navigation.main.pricing"), href: href("/pricing") },
    { label: t("navigation.main.blog"), href: href("/blog") },
    { label: t("navigation.main.contact"), href: href("/contact") },
  ];
  const legal = [
    { label: t("navigation.footer.legal.terms"), href: href("/terms") },
    { label: t("navigation.footer.legal.privacy"), href: href("/privacy") },
    { label: t("navigation.footer.legal.cookies"), href: href("/cookies") },
    { label: t("navigation.footer.legal.refund"), href: href("/refund") },
  ];

  return (
    <footer className="relative overflow-hidden border-t border-amber-200/[0.08] bg-stone-950 text-stone-300">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-[40vh] w-[60vh] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(245,178,120,0.08),transparent)]" />
      <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-16 sm:px-8 sm:pb-16 sm:pt-20">
        <div className="grid gap-12 sm:grid-cols-3 sm:gap-8 lg:grid-cols-[1.8fr_1fr_1fr]">
          {/* 品牌 */}
          <div>
            <Link
              href={locale === "en" ? "/" : `/${locale}/`}
              className={`${display.className} text-2xl tracking-tight text-stone-50`}
            >
              Scene<span className="italic text-amber-300/95">Self</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-400">
              {t("scene.tagline")}
            </p>
          </div>

          {/* Product */}
          <FooterCol title={t("navigation.footer.product.title")} items={product} />
          {/* Legal */}
          <FooterCol title={t("navigation.footer.legal.title")} items={legal} />
        </div>

        {/* 底栏 */}
        <div className="mt-14 flex flex-col gap-3 border-t border-amber-200/[0.06] pt-6 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{t("common.brand.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-[0.2em] text-amber-200/70">{title}</h4>
      <ul className="mt-4 space-y-2.5">
        {items.map(it => (
          <li key={it.href}>
            <Link href={it.href} className="text-sm text-stone-400 transition hover:text-amber-100">{it.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
