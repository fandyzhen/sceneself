import type { Metadata } from "next";
import { MarketingChrome } from "./marketing-chrome";
import { getTranslations } from 'next-intl/server';
import type { Locale } from "@/i18n.config";

export async function generateMetadata(
  props: {
    params: Promise<{ locale: Locale }>
  }
): Promise<Metadata> {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: 'seo' });

  return {
    title: t('home.title'),
    description: t('home.description'),
    openGraph: {
      images: [t('home.ogImage')],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <MarketingChrome>{children}</MarketingChrome>;
}
