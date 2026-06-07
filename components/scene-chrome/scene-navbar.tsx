"use client";

// SceneNavBar — 品牌统一的全局导航,替代旧模板的 NavBar。
// 风格:暗 stone-950 + amber 高光 + Fraunces italic Logo,与首页 CinemaStripHero 一脉相承。
//
// 适用场景:所有非首页页面(marketing 子页 / auth / protected / pricing / legal)。
// 首页本身用 CinemaStripHero 自带的内联 nav,不套这里。

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Fraunces } from "next/font/google";
import {
  IconUser,
  IconLogout,
  IconLayoutDashboard,
  IconShield,
  IconCoins,
  IconSettings,
  IconChevronDown,
  IconCheck,
  IconWorld,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";
import { signOut, useSession } from "@/lib/auth-client";
import { locales, localeNames } from "@/i18n.config";
import type { Locale } from "@/i18n.config";
import { cn } from "@/lib/utils";

const display = Fraunces({ subsets: ["latin"], weight: ["500", "600", "900"], style: ["italic", "normal"], display: "swap" });

// Marketing nav items(精简过,移除原 demo dropdown — 内部演示不该出现在主导航)。
const NAV_ITEMS = [
  { key: "pricing", href: "/pricing" },
  { key: "blog", href: "/blog" },
  { key: "contact", href: "/contact" },
] as const;

interface SceneNavBarProps {
  /** 首页 hero 100svh 沉浸式,不需要 nav 推下主内容 → noSpacer=true 隐藏占位 div */
  noSpacer?: boolean;
  /** 首页 hero 上方 fixed nav 默认完全透明,滚动后才出现 backdrop-blur 暗背景 */
  transparent?: boolean;
}

export function SceneNavBar({ noSpacer = false, transparent = false }: SceneNavBarProps = {}) {
  const t = useTranslations("navigation.main");
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const locale = useLocale();

  useMotionValueEvent(scrollY, "change", v => setScrolled(v > 24));

  return (
    <>
      <motion.nav
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.6, 0.05, 0.1, 0.9] }}
        className="fixed inset-x-0 top-3 z-50 mx-auto w-[calc(100%-1.5rem)] max-w-6xl px-0"
      >
        <div
          className={cn(
            "flex items-center justify-between rounded-full border px-3 py-2 transition-all duration-300 sm:px-4",
            scrolled
              ? "border-amber-200/15 bg-stone-950/85 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)]"
              : transparent
                ? "border-transparent bg-transparent" // hero 模式:完全透明,不抢 hero 视觉
                : "border-amber-200/[0.06] bg-stone-950/55 backdrop-blur-xl"
          )}
        >
          {/* Logo */}
          <Link
            href={locale === "en" ? "/" : `/${locale}/`}
            className={cn(display.className, "shrink-0 px-2 text-base tracking-tight text-stone-50 sm:text-lg")}
          >
            Scene<span className="italic text-amber-300/95">Self</span>
          </Link>

          {/* Center nav (desktop only) */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map(item => (
              <NavLink key={item.key} href={item.href}>{t(item.key)}</NavLink>
            ))}
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <SceneLanguageSwitcher />
            <SceneUserMenu />
            <button
              type="button"
              onClick={() => setMobileOpen(v => !v)}
              className="grid h-9 w-9 place-items-center rounded-full text-stone-300 transition hover:bg-amber-200/[0.08] hover:text-amber-200 md:hidden"
              aria-label="Menu"
            >
              {mobileOpen ? <IconX className="h-5 w-5" /> : <IconMenu2 className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm" />
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-x-3 top-[4.5rem] rounded-3xl border border-amber-200/15 bg-stone-950/95 p-4 backdrop-blur-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.key}
                  href={localized(locale, item.href)}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-2xl px-4 py-3 text-base text-stone-200 transition hover:bg-amber-200/[0.07] hover:text-amber-100"
                >
                  {t(item.key)}
                </Link>
              ))}
            </nav>
          </motion.div>
        </div>
      )}

      {/* 顶部 spacer:避免 fixed nav 遮挡内容(首屏 hero 100vh 的页面不需,但通用页需要) */}
      {!noSpacer && <div className="h-[72px]" aria-hidden />}
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const locale = useLocale();
  return (
    <Link
      href={localized(locale, href)}
      className="rounded-full px-3.5 py-1.5 text-sm text-stone-300 transition hover:bg-amber-200/[0.07] hover:text-amber-100"
    >
      {children}
    </Link>
  );
}

function localized(locale: string, href: string) {
  return locale === "en" ? href : `/${locale}${href}`;
}

// ─────────── SceneLanguageSwitcher ───────────
function SceneLanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const switchTo = (next: Locale) => {
    if (next === locale) return setOpen(false);
    let path = pathname;
    for (const loc of locales) {
      if (pathname === `/${loc}` || pathname.startsWith(`/${loc}/`)) {
        path = pathname.slice(loc.length + 1) || "/";
        break;
      }
    }
    const normalized = path === "/" ? "" : path;
    router.push(`/${next}${normalized}`);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-stone-300 transition hover:bg-amber-200/[0.07] hover:text-amber-100 sm:px-3 sm:text-sm"
        aria-haspopup="menu"
      >
        <IconWorld className="h-4 w-4" />
        <span className="hidden sm:inline">{localeNames[locale]}</span>
        <IconChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 min-w-[10rem] overflow-hidden rounded-2xl border border-amber-200/15 bg-stone-950/95 py-1 backdrop-blur-xl shadow-xl">
          {locales.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => switchTo(l)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2 text-sm text-stone-200 transition hover:bg-amber-200/[0.07] hover:text-amber-100"
            >
              <span>{localeNames[l]}</span>
              {l === locale && <IconCheck className="h-4 w-4 text-amber-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────── SceneUserMenu ───────────
function SceneUserMenu() {
  const session = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!session.data?.user?.id) return;
    fetch("/api/user/admin-status").then(r => r.ok ? r.json() : null).then(d => d && setIsAdmin(!!d.isAdmin)).catch(() => {});
  }, [session.data?.user?.id]);

  if (session.isPending) {
    return <div className="h-7 w-7 animate-pulse rounded-full bg-amber-200/10" />;
  }

  if (!session.data?.user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href={`/${locale}/login`}
          className="hidden rounded-full px-3 py-1.5 text-sm text-stone-300 transition hover:text-amber-100 sm:inline-flex"
        >
          {t("common.actions.signIn")}
        </Link>
        <Link
          href={`/${locale}/signup`}
          className="rounded-full bg-gradient-to-r from-amber-200 to-orange-300 px-3.5 py-1.5 text-xs font-semibold text-stone-900 shadow-[0_6px_24px_-8px_rgba(245,178,120,0.55)] transition hover:brightness-105 sm:px-4 sm:text-sm"
        >
          {t("common.actions.signUp")}
        </Link>
      </div>
    );
  }

  const user = session.data.user;
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();
  const items: { href: string; icon: typeof IconLayoutDashboard; key: string }[] = [
    { href: `/${locale}/dashboard`, icon: IconLayoutDashboard, key: "navigation.main.dashboard" },
    { href: `/${locale}/credits`, icon: IconCoins, key: "navigation.main.credits" },
    { href: `/${locale}/profile`, icon: IconUser, key: "navigation.main.profile" },
    { href: `/${locale}/settings`, icon: IconSettings, key: "navigation.main.settings" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-amber-200 to-orange-300 text-xs font-semibold text-stone-900 ring-1 ring-amber-200/30 transition hover:ring-amber-200/70"
      >
        {user.image ? (
          <Image src={user.image} alt={user.name || "User"} width={32} height={32} className="h-full w-full object-cover" unoptimized />
        ) : (
          initial
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 min-w-[14rem] overflow-hidden rounded-2xl border border-amber-200/15 bg-stone-950/95 py-1 backdrop-blur-xl shadow-xl">
          <div className="border-b border-amber-200/10 px-4 py-3">
            <p className="break-words text-sm font-medium text-stone-100">{user.name || user.email}</p>
            {user.name && <p className="mt-0.5 break-words text-xs text-stone-500">{user.email}</p>}
          </div>
          {items.map(it => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-stone-300 transition hover:bg-amber-200/[0.07] hover:text-amber-100"
            >
              <it.icon className="h-4 w-4" />
              {t(it.key)}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href={`/${locale}/admin`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-stone-300 transition hover:bg-amber-200/[0.07] hover:text-amber-100"
            >
              <IconShield className="h-4 w-4" />
              {t("Admin.sidebar.title")}
            </Link>
          )}
          <button
            type="button"
            onClick={async () => { await signOut(); router.push("/"); router.refresh(); }}
            className="flex w-full items-center gap-3 border-t border-amber-200/10 px-4 py-2 text-left text-sm text-stone-300 transition hover:bg-amber-200/[0.07] hover:text-amber-100"
          >
            <IconLogout className="h-4 w-4" />
            {t("common.actions.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
