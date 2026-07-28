import type { MetadataRoute } from 'next'
import { DIGITAL_CARD_CATEGORIES } from '@/data/digital-cards-categories'

// Standalone-subdomain canonical (served at the root, no path prefix).
// Override per-env with NEXT_PUBLIC_APP_URL.
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opuspass.opusfesta.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, priority: 1.0, changeFrequency: 'weekly' },
    { url: `${BASE}/digital-cards`, priority: 0.9, changeFrequency: 'weekly' },
    { url: `${BASE}/digital-cards/catalog`, priority: 0.8, changeFrequency: 'weekly' },
    { url: `${BASE}/pricing`, priority: 0.7, changeFrequency: 'monthly' },
    { url: `${BASE}/contact`, priority: 0.6, changeFrequency: 'monthly' },
    { url: `${BASE}/terms`, priority: 0.3, changeFrequency: 'yearly' },
    { url: `${BASE}/privacy`, priority: 0.3, changeFrequency: 'yearly' },
  ]

  const categoryRoutes: MetadataRoute.Sitemap = DIGITAL_CARD_CATEGORIES.map((c) => ({
    url: `${BASE}/digital-cards/${c.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...categoryRoutes]
}
