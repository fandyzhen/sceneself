import { getPublicAppUrl } from "@/lib/public-url";

const toBoolean = (value: string | undefined): boolean =>
  value?.toLowerCase() === "true";

export const analyticsConfig = {
  enableInDevelopment: toBoolean(process.env.NEXT_PUBLIC_ANALYTICS_ENABLE_IN_DEVELOPMENT),
};

export const websiteConfig = {
  appName: "SceneSelf",
  docsName: "SceneSelf Docs",
  appUrl: getPublicAppUrl(),
};
