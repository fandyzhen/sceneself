// inlineImageUrl：把外部图片 URL（如 R2 / Cloudflare CDN）下载到服务器侧、
// 缩小并转成 data:image/jpeg;base64，再传给火山方舟。
// 背景：火山方舟在中国大陆 IDC，主动跨境下载 R2 时常 Timeout（80s+ 才报错），
// 改为 Vercel/Node 端拉 → inline 传给火山，火山不需要外部下载，稳定性显著提升。
import sharp from "sharp";

const MAX_DIMENSION = 768; // 768 边长 + JPEG q88 一张 selfie 约 80-150KB base64，可接受
const QUALITY = 88;

export async function inlineImageUrl(url: string): Promise<string> {
  // 已经是 inline 的，直接返回
  if (url.startsWith("data:")) return url;

  const response = await fetch(url, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`inlineImageUrl fetch failed: ${response.status} ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  // 用 sharp 一并处理朝向、AVIF/HEIF → JPEG、缩小到合理 reference 尺寸。
  // 如果 sharp 不能解码（极少数情况），把原始 buffer 当 JPEG 直接 base64 兜底。
  let out: Buffer;
  try {
    out = await sharp(buffer)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    out = buffer;
  }
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}
