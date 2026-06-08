"use client";

// 单张 / 全部下载（v4：走同源代理）：
// - 用户体验要求：点击单张 → 下载这一张；点击全部 → 逐张触发下载，不打包。
// - R2 public bucket（pub-*.r2.dev）默认不带 CORS 头，前端直接 fetch 会被拦
//   （这就是用户最初投诉的"Could not load images"根因）。
//   解法：所有下载都走 /api/scene/download?url=...&name=... 同源代理，
//   服务端透传 + Content-Disposition: attachment，让浏览器原生触发下载弹窗，
//   完全绕开 CORS / a[download] 跨域被忽略的问题。
// - 全部下载：循环逐张触发，每次小间隔（~400ms）防止浏览器去重 / 拒绝连点。
import { useState } from "react";
import { Download } from "lucide-react";

interface Frame {
  imageUrl: string | null;
  narrativeRole?: string | null;
}

interface Props {
  frames: Frame[];
  prompt: string;
  label: string;
  sharingLabel: string;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "scene";
}

// 触发一次浏览器原生下载（filename 由 server Content-Disposition 头声明）。
// 单张 / 全部下载共用。返回 Promise 让调用方可以串行 + 加间隔。
export async function downloadImage(url: string, filename: string): Promise<void> {
  const proxy = `/api/scene/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
  const a = document.createElement("a");
  a.href = proxy;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function DownloadAllButton({ frames, prompt, label, sharingLabel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = frames.map(f => f.imageUrl).filter((u): u is string => !!u);

  async function handleClick() {
    if (busy || urls.length === 0) return;
    setBusy(true);
    setError(null);
    const slug = slugify(prompt);
    let triggered = 0;
    for (let i = 0; i < urls.length; i++) {
      try {
        const name = `sceneself-${slug}-${String(i + 1).padStart(2, "0")}.jpg`;
        await downloadImage(urls[i], name);
        triggered++;
        // 间隔 400ms：让浏览器把多次下载识别为独立动作，避免被合并 / 触发"是否允许多次下载"提示后被拒。
        await new Promise(res => setTimeout(res, 400));
      } catch (e) {
        console.error(`[DownloadAllButton] download image ${i + 1} failed:`, e);
      }
    }
    setBusy(false);
    if (triggered === 0) {
      setError("Download failed. Please try again.");
    } else if (triggered < urls.length) {
      setError(`${urls.length - triggered} of ${urls.length} image(s) failed to download.`);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || urls.length === 0}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-6 py-4 text-[15px] font-semibold text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {busy ? sharingLabel : `${label} (${urls.length})`}
      </button>
      {error && (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.08] px-4 py-2.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
