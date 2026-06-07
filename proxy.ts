import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale, localePrefix } from './i18n.config';

export const proxy = createMiddleware({
  locales,
  defaultLocale,
  localePrefix,
  // 关闭 Accept-Language 自动检测:产品定位为面向海外的英文站,
  // 中文是次要语言。开启会让中文系统用户访问 sceneself.com 直接 302 到 /zh,
  // 海外英语用户体验割裂。所有人默认看 en,要中文显式选择(/zh/...)。
  localeDetection: false,
});

export const config = {
  matcher: [
    '/',
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};
