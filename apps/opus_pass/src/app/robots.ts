import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opuspass.opusfesta.com'
  // opus_pass is served at the subdomain root, so paths have no prefix.
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/my/',
          '/rsvp/',
          '/pledge/',
          '/collect/',
          // Per-guest pass surface, same class as /rsvp and /pledge above.
          '/p/',
          '/digital-cards/checkout',
          '/digital-cards/cart',
          '/digital-cards/confirmation',
          '/digital-cards/address',
          '/api/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
