import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { keyFromR2Url } from "@/lib/r2-storage";

// keyFromR2Url 是隐私清理的关键工具:从公网 URL 反推 R2 key,
// 才能让 purgeIdentity / cleanup-selfies 删掉用户上传的自拍物理文件。
// 函数运行时读 process.env.STORAGE_PUBLIC_URL,所以测试可以直接 set/unset env。

const PUBLIC_BASE = "https://pub-53bf7fe0b7b04e059700336b43ffa737.r2.dev";

describe("keyFromR2Url(url)", () => {
  let origUrl: string | undefined;
  beforeEach(() => {
    origUrl = process.env.STORAGE_PUBLIC_URL;
    process.env.STORAGE_PUBLIC_URL = PUBLIC_BASE;
  });
  afterEach(() => {
    if (origUrl === undefined) delete process.env.STORAGE_PUBLIC_URL;
    else process.env.STORAGE_PUBLIC_URL = origUrl;
  });

  it("正常 selfie URL → 反推 selfies/<userId>/<uuid>.jpg", () => {
    expect(keyFromR2Url(`${PUBLIC_BASE}/selfies/abc/xyz.jpg`)).toBe("selfies/abc/xyz.jpg");
  });

  it("生成图 URL → images/<userId>/<ts>_<rand>.png", () => {
    expect(keyFromR2Url(`${PUBLIC_BASE}/images/u1/1717830000000_abc12.png`)).toBe(
      "images/u1/1717830000000_abc12.png",
    );
  });

  it("公网 URL 末尾带斜杠也能匹配(防 env 配置不一致)", () => {
    process.env.STORAGE_PUBLIC_URL = PUBLIC_BASE + "/";
    expect(keyFromR2Url(`${PUBLIC_BASE}/selfies/u/a.jpg`)).toBe("selfies/u/a.jpg");
  });

  it("非 R2 来源(data URL)→ null,避免误删", () => {
    expect(keyFromR2Url("data:image/png;base64,iVBOR...")).toBeNull();
  });

  it("Provider 兜底 URL(R2 失败时返回 OpenRouter URL)→ null", () => {
    expect(keyFromR2Url("https://openrouter.ai/api/image/abc.png")).toBeNull();
  });

  it("null / 空字符串 / undefined → null,不抛", () => {
    expect(keyFromR2Url(null)).toBeNull();
    expect(keyFromR2Url(undefined)).toBeNull();
    expect(keyFromR2Url("")).toBeNull();
  });

  it("URL 等于 base 自身(无 key)→ null,不返空字符串误删 bucket 根", () => {
    expect(keyFromR2Url(PUBLIC_BASE)).toBeNull();
    expect(keyFromR2Url(PUBLIC_BASE + "/")).toBeNull();
  });

  it("STORAGE_PUBLIC_URL 未配置时一律 null(避免误判 data URL)", () => {
    delete process.env.STORAGE_PUBLIC_URL;
    expect(keyFromR2Url(`${PUBLIC_BASE}/selfies/a/b.jpg`)).toBeNull();
  });
});
