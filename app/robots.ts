import type { MetadataRoute } from 'next'
import { getPublicAppUrl } from '@/lib/public-url'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getPublicAppUrl()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/zh/admin/',
        '/dashboard/',
        '/zh/dashboard/',
        '/profile/',
        '/zh/profile/',
        '/settings/',
        '/zh/settings/',
        '/credits/',
        '/zh/credits/',
        '/login',
        '/zh/login',
        '/signup',
        '/zh/signup',
        '/check-email',
        '/zh/check-email',
        '/verify-email',
        '/zh/verify-email',
        '/forgot-password',
        '/zh/forgot-password',
        '/reset-password',
        '/zh/reset-password',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
