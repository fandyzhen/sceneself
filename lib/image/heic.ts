// HEIC/HEIF 兼容：iPhone 默认拍照存 HEIC，火山出图 API 不认。
// isHeic 用 ftyp box 魔数识别（纯函数，可测）；heicToJpeg 用纯 JS 的 heic-convert 转码（无原生依赖，Vercel 可跑）。
import convert from "heic-convert";

const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "mif1", "heif", "msf1"];

export function isHeic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // 偏移 4..8 必须是 'ftyp'，8..12 是 major brand
  if (buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12);
  return HEIC_BRANDS.includes(brand);
}

export async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  const out = await convert({ buffer: buf, format: "JPEG", quality: 0.92 });
  return Buffer.from(out);
}
