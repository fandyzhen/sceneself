import { getPublicAppUrl } from "@/lib/public-url";

describe("getPublicAppUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalEnv;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("uses sceneself.com when production env accidentally contains localhost", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NODE_ENV = "production";

    expect(getPublicAppUrl()).toBe("https://sceneself.com");
  });

  it("keeps explicit non-local production domains and removes trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.sceneself.com/";
    process.env.NODE_ENV = "production";

    expect(getPublicAppUrl()).toBe("https://preview.sceneself.com");
  });
});
