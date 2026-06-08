import { NextRequest, NextResponse } from "next/server";

// 下载代理 endpoint：让浏览器原生触发"另存为"对话框。
//
// 背景：成品图存 Cloudflare R2 public bucket，pub-*.r2.dev 默认不带 CORS 头，
// 前端直接 fetch(url, {mode:"cors"}) 一律被拦（用户最初投诉的 "Could not load images" 根因）。
// 解法：同源代理 + Content-Disposition: attachment，绕开 CORS 限制并强制触发下载。
//
// 安全：
//  - 仅允许白名单 hostname（R2 public bucket / 自定义 CDN host），防 SSRF
//  - 限制响应大小（20MB），避免被滥用拉大文件
//  - GET 方法 + 短 maxDuration，纯透传，无 DB 接触
//
// 不强制登录：成品图本身是 public R2，仅是 CORS 阻塞前端 fetch；
// 此 endpoint 只是把同一资源换个域名出，安全模型等价于直链 + 设了 attachment 头。

export const maxDuration = 30;

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const SAFE_FILENAME_RE = /[^a-zA-Z0-9._-]+/g;

function publicUrlHost(): string | null {
  const raw = process.env.STORAGE_PUBLIC_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  // Cloudflare R2 public bucket（pub-xxx.r2.dev）+ S3 endpoint（xxx.r2.cloudflarestorage.com）
  if (h.endsWith(".r2.dev") || h.endsWith(".r2.cloudflarestorage.com")) return true;
  // 用户自定义 CDN（STORAGE_PUBLIC_URL）
  const customHost = publicUrlHost();
  if (customHost && h === customHost) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");
  const rawName = searchParams.get("name") ?? "sceneself.jpg";
  if (!rawUrl) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "invalid protocol" }, { status: 400 });
  }
  if (!isAllowedHost(target.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  // 文件名清理：保留字母数字 / 点 / 下划线 / 横线，截断到合理长度。
  const filename = rawName.replace(SAFE_FILENAME_RE, "_").slice(0, 80) || "sceneself.jpg";

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { Accept: "image/*" },
      // 让超时由 Next.js maxDuration 兜底；这里不显式 AbortController 简化。
    });
  } catch (e) {
    console.error("[scene/download] fetch failed:", e);
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared && declared > MAX_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  // 一次性读 buffer：图片单张 ≤ 几 MB,简单稳；上面已经 reject 超大文件。
  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buf.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
