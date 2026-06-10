const DEFAULT_PUBLIC_APP_URL = "https://sceneself.com";

function isLocalHost(hostname: string) {
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local");
}

export function getPublicAppUrl() {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL).trim();

  try {
    const url = new URL(raw);
    if (process.env.NODE_ENV === "production" && isLocalHost(url.hostname)) {
      return DEFAULT_PUBLIC_APP_URL;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_PUBLIC_APP_URL;
  }
}
