"use client";

import { usePathname } from "next/navigation";
import { SceneNavBar } from "@/components/scene-chrome/scene-navbar";
import { SceneFooter } from "@/components/scene-chrome/scene-footer";

// 所有 marketing 页面统一套品牌 chrome (SceneNavBar + SceneFooter)。
// 首页(landing)特殊处理: nav 用 transparent + noSpacer 模式,让 hero 100svh 沉浸感不变,
//   nav 默认透明浮在 hero 上,滚动后才出现 backdrop-blur 背景。
// SceneFooter 始终显示 — Creem/Stripe 等支付平台审核明确要求首页底部能访问到
// Privacy/Terms/Refund/Cookie/Contact 链接,首页 bypass footer 会导致审核挂。
export function MarketingChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = /^\/(en|zh)?$/.test(pathname);

  return (
    <div className="dark min-h-screen bg-stone-950 text-stone-100">
      <SceneNavBar transparent={isLanding} noSpacer={isLanding} />
      <main>{children}</main>
      <SceneFooter />
    </div>
  );
}
