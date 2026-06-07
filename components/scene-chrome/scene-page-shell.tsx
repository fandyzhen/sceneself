// ScenePageShell — 通用暗色页面骨架,给 marketing 子页/auth/protected/legal 复用。
// 提供:背景(stone-950 + grain + 顶部 amber 微光) + 标准 max-w 容器。
// 不含 nav/footer —— 由各 layout 决定是否套(marketing-chrome / protected layout / auth layout 各自处理)。

import { cn } from "@/lib/utils";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")";

interface ScenePageShellProps {
  children: React.ReactNode;
  className?: string;
  /** 是否需要顶部 amber glow(hero 区) */
  glow?: boolean;
}

export function ScenePageShell({ children, className, glow = true }: ScenePageShellProps) {
  return (
    <div className={cn("relative min-h-screen bg-stone-950 text-stone-100", className)}>
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-20 z-0 h-[60vh] bg-[radial-gradient(60%_55%_at_50%_0%,rgba(245,178,120,0.16),rgba(12,10,9,0)_70%)]"
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.08] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
