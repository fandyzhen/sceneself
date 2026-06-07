"use client";

// ScenePromoAside — 共享的右侧装饰区：双列垂直滚动胶片墙 + 中央诗意文案 + 暗角。
// 由 SceneAuthLayout 和 contact 页共用，未来修改右侧样式只需改这里一次。
// 移动端隐藏（只在 lg+ 显示）；调用方负责左侧布局。

import { useTranslations } from "next-intl";
import { Fraunces } from "next/font/google";
import { SHOWCASE_FLAT_IMAGES } from "@/lib/landing/showcase-sets";

const display = Fraunces({ subsets: ["latin"], weight: ["500", "600", "900"], style: ["italic", "normal"], display: "swap" });

export function ScenePromoAside() {
  const t = useTranslations("scene.landing.cinema");
  return (
    <aside className="relative hidden overflow-hidden border-l border-amber-200/[0.08] bg-stone-950 lg:block">
      <CinemaStrip />
      {/* 中央叠加诗意文案 */}
      <div className="pointer-events-none absolute inset-0 flex items-end p-10">
        <div className="max-w-sm">
          <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200/75">{t("kicker")}</p>
          <p className={`${display.className} mt-3 text-3xl leading-tight text-stone-50`}>
            {t("h1a")}
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-orange-300 to-amber-200 bg-clip-text italic text-transparent">{t("h1b")}</span>
          </p>
        </div>
      </div>
      {/* 暗角 vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(12,10,9,0.7)_85%)]"
      />
    </aside>
  );
}

// 双列垂直滚动胶片带。
function CinemaStrip() {
  const doubled = [...SHOWCASE_FLAT_IMAGES, ...SHOWCASE_FLAT_IMAGES];
  return (
    <div className="relative h-full overflow-hidden">
      <style>{`
        @keyframes scene-promo-marquee-down {
          0% { transform: translate3d(0, -50%, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-promo-marquee] { animation: none !important; }
        }
      `}</style>
      <div className="absolute inset-0 grid grid-cols-2 gap-2 p-2">
        <div
          data-promo-marquee
          className="flex flex-col gap-2 will-change-transform"
          style={{ animation: "scene-promo-marquee-down 90s linear infinite" }}
        >
          {doubled.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`a-${i}`}
              src={img.url}
              alt=""
              loading={i < 4 ? "eager" : "lazy"}
              decoding="async"
              className="aspect-[4/5] w-full flex-shrink-0 rounded-md border border-amber-100/[0.05] object-cover"
            />
          ))}
        </div>
        <div
          data-promo-marquee
          className="flex flex-col gap-2 will-change-transform"
          style={{ animation: "scene-promo-marquee-down 130s linear infinite reverse" }}
        >
          {[...doubled].reverse().map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`b-${i}`}
              src={img.url}
              alt=""
              loading={i < 4 ? "eager" : "lazy"}
              decoding="async"
              className="aspect-[4/5] w-full flex-shrink-0 rounded-md border border-amber-100/[0.05] object-cover"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
