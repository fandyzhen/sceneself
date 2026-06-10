import robots from "@/app/robots";

describe("robots", () => {
  it("keeps private app surfaces out of search while exposing the sitemap", () => {
    const config = robots();

    expect(config.sitemap).toBe("https://sceneself.com/sitemap.xml");
    expect(config.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
    });
    expect(config.rules.disallow).toEqual(
      expect.arrayContaining([
        "/api/",
        "/admin/",
        "/zh/admin/",
        "/dashboard/",
        "/zh/dashboard/",
        "/login",
        "/zh/login",
        "/signup",
        "/zh/signup",
      ]),
    );
  });
});
