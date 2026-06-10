import { Metadata } from 'next'
import { defaultLocale } from '@/i18n.config'
import { getPublicAppUrl } from '@/lib/public-url'

const baseUrl = getPublicAppUrl()

interface GenerateMetadataProps {
  locale: string
  path: string
  title: string
  description: string
  ogImage?: string
}

export function generatePageMetadata({
  locale,
  path,
  title,
  description,
  ogImage = `${baseUrl}/banner.png`,
}: GenerateMetadataProps): Metadata {
  // localePrefix 是 as-needed:默认语言(en)不带 /en 前缀
  const englishUrl = `${baseUrl}${path || '/'}`
  const canonicalUrl = locale === defaultLocale ? englishUrl : `${baseUrl}/${locale}${path}`

  // Generate alternate language URLs
  const alternates = {
    canonical: canonicalUrl,
    languages: {
      'zh-CN': `${baseUrl}/zh${path}`,
      'en-US': englishUrl,
      'x-default': englishUrl,
    },
  }

  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'SceneSelf',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  }
}
