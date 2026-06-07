"use client";

// CinemaStripHero — 首屏 "电影胶片墙":3 行 (移动 2 行) 水平 marquee 永不停止 ×
// 中央浮层文案 × hover/tap 同组 6 张高亮 × 顶/底胶片穿孔装饰带。
// 真实素材取自 lib/landing/showcase-sets 的 60 张 R2 永久 URL。
//
// 性能取舍:
//  - 60 张图 × 2 份 × 3 行 = 360 个 <img>。用 native lazy + IntersectionObserver 跳过视口外渲染。
//  - 不用 next/image:next/image 的强制 width/height 在 marquee 场景下不便,且 R2 已是 CDN,无 LCP 风险。
//  - 第一行首屏可见的前 ~8 张加 fetchpriority="high",其余 lazy。
//  - marquee 用 CSS keyframes (animation-play-state 切 paused 即可暂停),纯 GPU,无 JS rAF。

import { useState, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Fraunces } from "next/font/google";
import { ArrowRight, Sparkles } from "lucide-react";
import { SHOWCASE_FLAT_IMAGES } from "@/lib/landing/showcase-sets";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

// 三行错位:row1 顺序 / row2 反向 / row3 旋转 30 位 → 视觉上看不出"同一份数据三遍"。
const ROW1 = SHOWCASE_FLAT_IMAGES;
const ROW2 = [...SHOWCASE_FLAT_IMAGES].reverse();
const ROW3 = [...SHOWCASE_FLAT_IMAGES.slice(30), ...SHOWCASE_FLAT_IMAGES.slice(0, 30)];

interface ImgRef {
  url: string;
  setId: string;
}

function Perforation() {
  // 胶片顶/底/行间的穿孔装饰带。CSS radial-gradient 模拟等距方孔,纯装饰,无 DOM 数量代价。
  return (
    <div
      aria-hidden
      className="h-[6px] sm:h-[8px] flex-shrink-0 bg-stone-950"
      style={{
        backgroundImage:
          "radial-gradient(circle at center, rgba(245,178,120,0.22) 1px, transparent 1.4px)",
        backgroundSize: "14px 100%",
        backgroundRepeat: "repeat-x",
        backgroundPosition: "0 center",
      }}
    />
  );
}

interface MarqueeRowProps {
  images: readonly ImgRef[];
  duration: number;
  direction: "left" | "right";
  className?: string;
  activeSetId: string | null;
  onSetHover: (id: string | null) => void;
  priority?: number; // 给前 N 张加 fetchpriority='high'
}

function MarqueeRow({ images, duration, direction, className, activeSetId, onSetHover, priority = 0 }: MarqueeRowProps) {
  const animationName = direction === "left" ? "scene-marquee-left" : "scene-marquee-right";
  // duplicate 一份 → translateX 50% 后无缝回到原点
  const doubled = useMemo(() => [...images, ...images], [images]);
  return (
    <div className={`relative flex-1 overflow-hidden ${className ?? ""}`}>
      <div
        className="flex h-full gap-[6px] will-change-transform"
        style={{
          animation: `${animationName} ${duration}s linear infinite`,
          animationPlayState: activeSetId ? "paused" : "running",
        }}
      >
        {doubled.map((img, i) => {
          const isActive = activeSetId === img.setId;
          const isDimmed = activeSetId !== null && !isActive;
          return (
            <button
              key={`${img.setId}-${i}`}
              type="button"
              aria-label={`Preview scene set`}
              className={`group relative h-full aspect-[4/5] flex-shrink-0 overflow-hidden rounded-md border border-amber-100/[0.05] bg-stone-900 transition-[opacity,filter,transform,box-shadow] duration-300 ease-out ${
                isActive ? "scale-[1.035] ring-1 ring-amber-300/80 shadow-[0_0_28px_-4px_rgba(245,178,120,0.55)]" : ""
              } ${isDimmed ? "opacity-25 grayscale" : "opacity-100"}`}
              onMouseEnter={() => onSetHover(img.setId)}
              onMouseLeave={() => onSetHover(null)}
              onClick={() => onSetHover(activeSetId === img.setId ? null : img.setId)}
              onFocus={() => onSetHover(img.setId)}
              onBlur={() => onSetHover(null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                loading={i < priority ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={i < priority ? "high" : "auto"}
                className="h-full w-full object-cover"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CinemaStripHero() {
  const t = useTranslations("scene.landing");
  const locale = useLocale();
  const createHref = locale === "en" ? "/create" : `/${locale}/create`;
  const [activeSetId, setActiveSetId] = useState<string | null>(null);

  // 节流:hover 抖动时不要频繁 set state
  const handleHover = useCallback((id: string | null) => setActiveSetId(id), []);

  return (
    <section
      className="relative isolate flex h-[100svh] min-h-[640px] flex-col overflow-hidden bg-stone-950 text-stone-100"
      onMouseLeave={() => setActiveSetId(null)}
    >
      {/* marquee keyframes:scoped 到本组件,不污染 globals.css */}
      <style>{`
        @keyframes scene-marquee-left {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes scene-marquee-right {
          0% { transform: translate3d(-50%, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-marquee] { animation: none !important; }
        }
      `}</style>

      {/* 三行胶片带容器 */}
      <div className="absolute inset-0 z-0 flex flex-col">
        <Perforation />
        <MarqueeRow
          images={ROW1}
          duration={40}
          direction="left"
          activeSetId={activeSetId}
          onSetHover={handleHover}
          priority={8}
        />
        <Perforation />
        <MarqueeRow
          images={ROW2}
          duration={55}
          direction="right"
          activeSetId={activeSetId}
          onSetHover={handleHover}
        />
        <Perforation />
        {/* 第 3 行只在桌面显示,移动端隐藏避免太密 */}
        <MarqueeRow
          images={ROW3}
          duration={32}
          direction="left"
          className="hidden lg:block"
          activeSetId={activeSetId}
          onSetHover={handleHover}
        />
        <Perforation />
      </div>

      {/* 暗角 vignette:中央亮、四周暗,让浮层文案突出 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(12,10,9,0.55)_55%,rgba(12,10,9,0.92)_92%)]"
      />
      {/* grain:暗房颗粒感 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] mix-blend-overlay opacity-[0.18]"
        style={{ backgroundImage: GRAIN }}
      />
      {/* 顶部 amber 微光,从上方渗下 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-40 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(245,178,120,0.22),transparent_70%)]"
      />

      {/* Nav 由全局 SceneNavBar (marketing-chrome) 在 hero 上方浮现(transparent 模式)
          原 hero 内联 nav 已删,避免与 SceneNavBar 双 nav 冲突。 */}

      {/* 中央浮层文案 */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4">
        <div
          className="relative w-full max-w-[92vw] rounded-[2rem] border border-amber-200/15 bg-stone-950/70 px-7 py-9 backdrop-blur-2xl sm:max-w-[520px] sm:rounded-[2.5rem] sm:px-12 sm:py-14"
          style={{ boxShadow: "0 40px 120px -32px rgba(245,178,120,0.35), 0 0 0 1px rgba(245,178,120,0.04) inset" }}
        >
          {/* 角标 amber dot,装饰但 readable */}
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/[0.07] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-amber-200/85">
            <Sparkles className="h-3 w-3" /> {t("cinema.kicker")}
          </span>
          <h1
            className={`${display.className} mt-5 text-[2.6rem] font-medium leading-[0.96] sm:text-[3.6rem]`}
          >
            {t("cinema.h1a")}
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-orange-300 to-amber-200 bg-clip-text italic text-transparent">
              {t("cinema.h1b")}
            </span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-stone-300/90 sm:text-base">
            {t("cinema.sub")}
          </p>
          <div className="mt-7 flex flex-col items-stretch gap-3 sm:mt-9 sm:flex-row sm:items-center sm:gap-4">
            <a
              href={createHref}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-200 to-orange-300 px-7 py-4 text-[15px] font-semibold text-stone-900 shadow-[0_10px_40px_-10px_rgba(245,178,120,0.65)] transition hover:brightness-105"
            >
              {t("cinema.cta")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <span className="text-center text-xs text-stone-500 sm:text-left sm:text-sm">{t("cinema.trust")}</span>
          </div>

          {/* 微交互提示:告诉用户可以悬停 */}
          <p className="mt-6 hidden text-[11px] text-stone-500/80 sm:block">
            <span className="opacity-60">↻</span> {t("cinema.hint")}
          </p>
        </div>
      </div>

      {/* 底部小提示 + 滚动指引 */}
      <div className="relative z-10 flex flex-col items-center gap-2 pb-5 sm:pb-7">
        <span className="text-[10px] uppercase tracking-[0.3em] text-stone-500/70">
          {t("cinema.scrollHint")}
        </span>
        <span className="block h-8 w-px bg-gradient-to-b from-amber-200/40 to-transparent" />
      </div>
    </section>
  );
}
