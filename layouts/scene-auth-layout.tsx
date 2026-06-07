"use client";

// SceneAuthLayout — Auth 页面框架,左侧 form 右侧 marquee 双列胶片带(呼应首页 hero)。
// 移动端:form 占满,胶片带隐藏。
// 不显示 SceneNavBar(auth 页面有意保持沉浸,只显示 logo 回到首页)。
// 右侧装饰用 ScenePromoAside 共享组件,contact 页与本页保持一致。

import Link from "next/link";
import { useLocale } from "next-intl";
import { Fraunces } from "next/font/google";
import { ScenePromoAside } from "@/components/scene-chrome/scene-promo-aside";

const display = Fraunces({ subsets: ["latin"], weight: ["500", "600", "900"], style: ["italic", "normal"], display: "swap" });

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")";

export function SceneAuthLayout({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  return (
    <div className="dark relative min-h-screen overflow-hidden bg-stone-950 text-stone-100">
      {/* 背景 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.10] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-20 z-0 h-[60vh] bg-[radial-gradient(60%_55%_at_50%_0%,rgba(245,178,120,0.14),rgba(12,10,9,0)_70%)]"
      />

      {/* 顶栏 logo (回首页) */}
      <header className="relative z-20 px-5 pt-6 sm:px-8">
        <Link
          href={locale === "en" ? "/" : `/${locale}/`}
          className={`${display.className} inline-block text-xl tracking-tight text-stone-50`}
        >
          Scene<span className="italic text-amber-300/95">Self</span>
        </Link>
      </header>

      {/* 主体:桌面 2 列(form / 胶片墙),移动 form 满屏 */}
      <main className="relative z-10 grid min-h-[calc(100vh-72px)] grid-cols-1 lg:grid-cols-[1fr_minmax(0,1fr)]">
        {/* 左:form */}
        <div className="flex items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
          <div className="w-full max-w-md">{children}</div>
        </div>

        {/* 右:共享装饰胶片墙(contact 页同款) */}
        <ScenePromoAside />
      </main>
    </div>
  );
}
