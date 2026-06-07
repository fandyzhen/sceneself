"use client";

// 一键打包/分享全部成片：
// - 移动端（iPhone/iPad/Android）优先 Web Share API（带 files，能直接保存到相册或发到 IM）
// - 桌面统一走 zip 下载（桌面 Chrome 的 share 系统集成不完整，常看似"无反应"）
// - 任何阶段失败都在按钮下方显示错误 + console.error，让用户知道
// jszip 走 dynamic import 防止首屏 bundle 增大。
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

function ext(mime: string) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  // 优先用 UA-CH（Chrome 89+）
  const uaData = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === "boolean") return uaData.mobile;
  // 回退到 UA 嗅探
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function DownloadAllButton({ frames, prompt, label, sharingLabel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = frames.map(f => f.imageUrl).filter((u): u is string => !!u);

  async function handleClick() {
    if (busy || urls.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const slug = slugify(prompt);
      // fetch 全部图片为 blob。失败的话基本是 R2 CORS 问题。
      const files: File[] = [];
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        try {
          const r = await fetch(u, { mode: "cors" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const b = await r.blob();
          const name = `sceneself-${slug}-${String(i + 1).padStart(2, "0")}.${ext(b.type)}`;
          files.push(new File([b], name, { type: b.type }));
        } catch (e) {
          console.error(`[DownloadAllButton] fetch image ${i + 1} failed:`, e);
          throw new Error(
            "Could not load images. Please right-click each image to save individually.",
          );
        }
      }

      // 移动端优先 Web Share API
      if (isMobileDevice() && typeof navigator !== "undefined" && "share" in navigator) {
        const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
        if (typeof nav.canShare === "function" && nav.canShare({ files })) {
          try {
            await nav.share({ files, title: "My SceneSelf scene" });
            return;
          } catch (e) {
            // 用户取消 → 不降级
            if (e instanceof Error && e.name === "AbortError") return;
            console.warn("[DownloadAllButton] share failed, falling back to zip:", e);
            // 其它错误继续降级 zip
          }
        }
      }

      // 桌面 / 移动端 share 失败 → 打 zip 下载
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      files.forEach(f => zip.file(f.name, f));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sceneself-${slug}-${urls.length}-photos.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error("[DownloadAllButton] handleClick failed:", e);
      setError(e instanceof Error ? e.message : "Download failed. Please try again or right-click each image to save individually.");
    } finally {
      setBusy(false);
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
