import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://sceneself.com";
  });

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }
  });

  it("uses as-needed locale URLs and avoids default-locale /en URLs", async () => {
    const entries = await sitemap();
    const urls = entries.map(entry => entry.url);

    expect(urls).toContain("https://sceneself.com/");
    expect(urls).toContain("https://sceneself.com/pricing");
    expect(urls).toContain("https://sceneself.com/zh");
    expect(urls).toContain("https://sceneself.com/zh/pricing");
    expect(urls).not.toContain("https://sceneself.com/en");
    expect(urls).not.toContain("https://sceneself.com/en/pricing");
  });

  it("includes localized blog detail pages in canonical URL form", async () => {
    const entries = await sitemap();
    const urls = entries.map(entry => entry.url);

    expect(urls).toContain("https://sceneself.com/blog/how-we-handle-your-selfie");
    expect(urls).toContain("https://sceneself.com/zh/blog/how-we-handle-your-selfie");
  });
});
