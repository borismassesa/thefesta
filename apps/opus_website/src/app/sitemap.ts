import type { MetadataRoute } from 'next'
import { vendors } from '@/lib/vendors'
import { getActiveMarketplaceVendors } from '@/lib/vendors-db'
import { loadPublishedAdviceIdeasPosts } from '@/lib/advice-ideas-db'
import { BRIDAL_CATEGORIES } from '@/lib/bridal-categories'
import { REGISTRY_CATEGORIES } from '@/lib/registry-categories'
import { getShopVendors, shopBasePath } from '@/lib/products-db'
import { loadOpenJobs } from '@/lib/careers-db'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opusfesta.com'

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: BASE, priority: 1.0, changeFrequency: 'weekly' },
  { url: `${BASE}/vendors`, priority: 0.9, changeFrequency: 'daily' },
  { url: `${BASE}/vendors/browse`, priority: 0.8, changeFrequency: 'daily' },
  { url: `${BASE}/advice-and-ideas`, priority: 0.8, changeFrequency: 'weekly' },
  // Digital Cards are served by the opus_pass zone (its own sitemap/subdomain);
  // opus_website's /digital-cards 308-redirects there, so it's omitted here.
  { url: `${BASE}/attire-and-rings`, priority: 0.8, changeFrequency: 'weekly' },
  { url: `${BASE}/attire-and-rings/bridal-collection`, priority: 0.7, changeFrequency: 'weekly' },
  { url: `${BASE}/attire-and-rings/shops`, priority: 0.7, changeFrequency: 'daily' },
  { url: `${BASE}/registry`, priority: 0.8, changeFrequency: 'daily' },
  { url: `${BASE}/registry/shops`, priority: 0.7, changeFrequency: 'daily' },
  { url: `${BASE}/planning-tools`, priority: 0.7, changeFrequency: 'monthly' },
  { url: `${BASE}/careers`, priority: 0.5, changeFrequency: 'weekly' },
  { url: `${BASE}/privacy-policy`, priority: 0.3, changeFrequency: 'yearly' },
  { url: `${BASE}/terms-of-use`, priority: 0.3, changeFrequency: 'yearly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [dbVendors, posts, giftShops, attireShops, careerJobs] = await Promise.all([
    getActiveMarketplaceVendors().catch(() => []),
    loadPublishedAdviceIdeasPosts().catch(() => []),
    getShopVendors('gift_shop').catch(() => []),
    getShopVendors('attire_rings').catch(() => []),
    loadOpenJobs().catch(() => []),
  ])

  const allVendorSlugs = new Set<string>([
    ...dbVendors.map((v) => v.slug),
    ...vendors.map((v) => v.slug),
  ])

  const vendorRoutes: MetadataRoute.Sitemap = Array.from(allVendorSlugs).map((slug) => ({
    url: `${BASE}/vendors/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const articleRoutes: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${BASE}/advice-and-ideas/${p.slug}`,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const bridalCategoryRoutes: MetadataRoute.Sitemap = BRIDAL_CATEGORIES.map((c) => ({
    url: `${BASE}/attire-and-rings/bridal-collection/${c.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const registryCategoryRoutes: MetadataRoute.Sitemap = REGISTRY_CATEGORIES.map((c) => ({
    url: `${BASE}/registry/${c.slug}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  // Seller shop pages. `getShopVendors` only returns shops with live stock, so
  // an empty storefront never lands in the sitemap. Product vendors are absent
  // from `vendorRoutes` by design: they don't have a /vendors/<slug> page.
  const shopRoutes: MetadataRoute.Sitemap = [...giftShops, ...attireShops].map((s) => ({
    url: `${BASE}${shopBasePath(s.vertical)}/${s.slug}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  const careerRoutes: MetadataRoute.Sitemap = careerJobs.map((job) => ({
    url: `${BASE}/careers/jobs/${job.slug}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  return [
    ...STATIC_ROUTES,
    ...vendorRoutes,
    ...articleRoutes,
    ...bridalCategoryRoutes,
    ...registryCategoryRoutes,
    ...shopRoutes,
    ...careerRoutes,
  ]
}
