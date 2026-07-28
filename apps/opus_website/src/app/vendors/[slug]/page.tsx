import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import VendorDetailPage from '@/components/vendors/VendorDetailPage'
import JsonLd from '@/components/JsonLd'
import { getVendor } from '@/lib/vendors'
import { getVendorFromDb } from '@/lib/vendors-db'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opusfesta.com'

// Read the vendor from Supabase, falling back to the hardcoded seed list
// (apps/opus_website/src/lib/vendors.ts) for slugs not yet in the DB. ISR
// (10-min window) instead of force-dynamic: storefront edits from the
// vendors_portal surface within ~10 minutes instead of re-rendering on every
// request. (Follow-up: have the portal POST /api/revalidate for instant updates.)
export const revalidate = 600

async function loadVendor(slug: string) {
  const fromDb = await getVendorFromDb(slug)
  if (fromDb) return fromDb
  return getVendor(slug)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const vendor = await loadVendor(slug)

  if (!vendor) {
    return { title: 'Vendor Not Found | OpusFesta' }
  }

  return {
    title: `${vendor.name} | OpusFesta Vendors`,
    description: vendor.excerpt,
    openGraph: {
      title: `${vendor.name} | OpusFesta`,
      description: vendor.excerpt,
      images: vendor.heroMedia?.src
        ? [{ url: vendor.heroMedia.src, alt: vendor.heroMedia.alt }]
        : [],
      type: 'profile',
    },
  }
}

export default async function VendorSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const vendor = await loadVendor(slug)

  if (!vendor) {
    notFound()
  }

  // No product grid here on purpose. This route resolves `vertical='service'`
  // vendors only (getVendorFromDb), and service vendors don't list products —
  // shops live at /registry/shops/<slug> and /attire-and-rings/shops/<slug>.
  const localBusinessSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: vendor.name,
    description: vendor.excerpt,
    url: `${BASE}/vendors/${vendor.slug}`,
    priceRange: vendor.priceRange,
    address: {
      '@type': 'PostalAddress',
      addressLocality: vendor.city,
      addressCountry: 'TZ',
      ...(vendor.location?.address ? { streetAddress: vendor.location.address } : {}),
    },
    ...(vendor.heroMedia?.src ? { image: vendor.heroMedia.src } : {}),
    ...(vendor.location?.lat && vendor.location?.lng
      ? { geo: { '@type': 'GeoCoordinates', latitude: vendor.location.lat, longitude: vendor.location.lng } }
      : {}),
    ...(vendor.rating && vendor.reviewCount
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: vendor.rating, reviewCount: vendor.reviewCount, bestRating: 5, worstRating: 1 } }
      : {}),
  }

  const faqSchema = vendor.faqs?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: vendor.faqs.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      }
    : null

  return (
    <>
      <JsonLd data={localBusinessSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}
      <VendorDetailPage vendor={vendor} />
    </>
  )
}
