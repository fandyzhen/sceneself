import { MetadataRoute } from 'next'
import { blogModuleLoaders } from '@/lib/blog-manifest.generated'
import { getPublicAppUrl } from '@/lib/public-url'

const STATIC_ROUTES = [
  '',
  '/pricing',
  '/blog',
  '/contact',
  '/privacy',
  '/terms',
  '/cookies',
  '/refund',
] as const

function localizedUrl(baseUrl: string, locale: 'en' | 'zh', path: string) {
  const normalizedPath = path === '' ? '/' : path
  if (locale === 'en') return `${baseUrl}${normalizedPath}`
  return `${baseUrl}/zh${path}`
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getPublicAppUrl()

  const blogRoutes = Object.keys(blogModuleLoaders)
    .sort()
    .map(slug => `/blog/${slug}`)

  const routes = [...STATIC_ROUTES, ...blogRoutes]
  const sitemapEntries: MetadataRoute.Sitemap = []

  routes.forEach((route) => {
    ;(['en', 'zh'] as const).forEach((locale) => {
      const isHome = route === ''
      const isBlogPost = route.startsWith('/blog/')
      sitemapEntries.push({
        url: localizedUrl(baseUrl, locale, route),
        changeFrequency: isHome ? 'daily' : isBlogPost ? 'monthly' : 'weekly',
        priority: isHome ? 1.0 : isBlogPost ? 0.7 : 0.8,
        alternates: {
          languages: {
            en: localizedUrl(baseUrl, 'en', route),
            zh: localizedUrl(baseUrl, 'zh', route),
            'x-default': localizedUrl(baseUrl, 'en', route),
          },
        },
      })
    })
  })

  return sitemapEntries
}
