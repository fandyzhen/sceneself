import { Background } from "@/components/background";
import { Metadata } from "next";
import { ContactForm } from "@/features/marketing/components/contact-form";
import { ScenePromoAside } from "@/components/scene-chrome/scene-promo-aside";
import { getTranslations } from 'next-intl/server';
import type { Locale } from "@/i18n.config";
import { generatePageMetadata } from "@/lib/metadata";

export async function generateMetadata(
  props: {
    params: Promise<{ locale: Locale }>
  }
): Promise<Metadata> {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: 'seo' });

  return generatePageMetadata({
    locale: params.locale,
    path: '/contact',
    title: t('contact.title'),
    description: t('contact.description'),
    ogImage: t('contact.ogImage'),
  });
}

export default async function ContactPage(
  props: {
    params: Promise<{ locale: Locale }>;
  }
) {
  await props.params;

  return (
    <div className="relative overflow-hidden bg-stone-950">
      <Background />
      <div className="relative grid min-h-screen w-full grid-cols-1 overflow-hidden lg:grid-cols-[1fr_minmax(0,1fr)]">
        <div className="flex items-center justify-center px-5 py-16 sm:px-8 sm:py-20 lg:py-14">
          <div className="w-full max-w-md">
            <ContactForm />
          </div>
        </div>
        <ScenePromoAside />
      </div>
    </div>
  );
}
