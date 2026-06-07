import { describe, it, expect } from "vitest";
import { isHeic } from "@/lib/image/heic";

// 构造一个带 ftyp box 的最小 buffer：[size(4)][ftyp(4)][major_brand(4)]
function ftyp(brand: string): Buffer {
  const b = Buffer.alloc(16);
  b.write("ftyp", 4, "ascii");
  b.write(brand, 8, "ascii");
  return b;
}

describe("isHeic", () => {
  it("识别 heic brand（iPhone 默认）", () => {
    expect(isHeic(ftyp("heic"))).toBe(true);
  });
  it("识别 heix brand", () => {
    expect(isHeic(ftyp("heix"))).toBe(true);
  });
  it("识别 mif1 brand（HEIF 容器）", () => {
    expect(isHeic(ftyp("mif1"))).toBe(true);
  });
  it("JPEG 不是 heic", () => {
    expect(isHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
  it("PNG 不是 heic", () => {
    expect(isHeic(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
  it("过短 buffer 不崩溃", () => {
    expect(isHeic(Buffer.from([0x00]))).toBe(false);
  });
});
