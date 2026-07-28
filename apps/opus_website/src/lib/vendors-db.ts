import { marketLabel } from '@opusfesta/lib'
import { createSupabaseServerClient } from '@/lib/supabase'
import { resolveServiceLabel } from '@/lib/vendor-services-catalog'
import type { Vendor, VendorCategoryId, VendorReview } from '@/lib/vendors'

/**
 * Maps the marketplace `vendors` table row (which the vendors_portal storefront
 * editors write to) into the public Vendor type used by the website
 * `/vendors/[slug]` detail page.
 *
 * IMPORTANT: this mapper deliberately does NOT run rows through `enrichVendor`
 * (the legacy seed enricher in `vendors-seed.ts`). `enrichVendor` synthesises
 * fake reviews, fake team members, fake awards, fake gallery images, fake
 * social links, etc. — appropriate for the demo seed list, dishonest for real
 * vendors who have only filled in what they've actually filled in. Marketplace
 * rows show only the fields the vendor populated; the detail UI renders an
 * empty / placeholder state for anything missing.
 */

type VendorRow = {
  id: string
  slug: string
  business_name: string | null
  category: string | null
  description: string | null
  bio: string | null
  logo: string | null
  cover_image: string | null
  location: { city?: string; region?: string; address?: string; lat?: number; lng?: number } | null
  contact_info: Record<string, unknown> | null
  social_links: Record<string, unknown> | null
  stats: { averageRating?: number; reviewCount?: number } | null
  price_range: string | null
  verified: boolean | null
  years_in_business: number | null
  services_offered: string[] | null
  // Onboarding draft persisted at submit time. Holds the long tail of fields
  // we don't have structured columns for yet (languages, hours, FAQs, team,
  // awards text, response time, locally-owned, deposit & cancellation policy,
  // style/personality). The mapper below reads them with `application_snapshot`
  // taking precedence over structured columns when both are present, so an
  // edit in the storefront editor that lands in a real column still wins.
  application_snapshot?: Record<string, unknown> | null
  // Migration 20260503000001 — admin-fillable structured fields that don't
  // (yet) come out of vendor onboarding.
  capacity?: { min?: number; max?: number } | null
  lat?: number | null
  lng?: number | null
  gallery_urls?: string[] | null
  // Migration 20260512000010 — vendor portfolio videos. Public URLs to
  // uploads in vendor-portfolios + YouTube/Vimeo embed links.
  video_urls?: string[] | null
  // Migration 20260503000003 — storefront persistence columns. Each is the
  // canonical source for its field; snapshot is the fallback for vendors
  // that submitted before the column existed. Column names below mirror
  // the SQL column names directly.
  hours?: Record<string, { open?: boolean; from?: string; to?: string }> | null
  languages?: string[] | null
  response_time_hours?: string | null
  locally_owned?: boolean | null
  parallel_booking_capacity?: number | null
  deposit_percent?: string | null
  cancellation_level?: string | null
  reschedule_policy?: string | null
  style?: string | null
  personality?: string | null
  service_markets?: string[] | null
  home_market?: string | null
  // Migration 20260624000001 — pricing extras + availability.
  starting_price?: string | null
  custom_quotes?: boolean | null
  availability?: Array<{ date?: string; status?: string; note?: string }> | null
  // Optional storefront-extended columns (added by later migrations); typed
  // loosely so the loader keeps working before/after each migration lands.
  gallery?: unknown
  team?: unknown
  faqs?: unknown
  awards?: unknown
  award_certificates?: unknown
  packages?: unknown
}

// --- Snapshot helpers ------------------------------------------------------

type SnapTeamMember = { name?: string; role?: string; bio?: string; avatar?: string }
type SnapFaq = { question?: string; answer?: string }
type SnapPkg = {
  id?: string
  name?: string
  price?: string
  description?: string
  includes?: string[]
  badge?: { label?: string; icon?: string; tone?: string } | null
}

function snap(row: VendorRow): Record<string, unknown> | null {
  const v = row.application_snapshot
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null
}

function snapStr(s: Record<string, unknown> | null, key: string): string | null {
  if (!s) return null
  const v = s[key]
  return typeof v === 'string' && v.trim() ? v : null
}

function snapArr(s: Record<string, unknown> | null, key: string): unknown[] {
  if (!s) return []
  const v = s[key]
  return Array.isArray(v) ? v : []
}

function snapObj(s: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!s) return null
  const v = s[key]
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function snapStrList(s: Record<string, unknown> | null, key: string): string[] {
  return snapArr(s, key).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
}

function snapLabels(s: Record<string, unknown> | null) {
  return snapObj(s, 'labels')
}

function snapBool(s: Record<string, unknown> | null, key: string): boolean | null {
  if (!s) return null
  const v = s[key]
  return typeof v === 'boolean' ? v : null
}

const VALID_CATEGORY_IDS: VendorCategoryId[] = [
  'venues',
  'photographers',
  'videographers',
  'florists',
  'caterers',
  'djs-bands',
  'hair-makeup',
  'wedding-cakes',
  'bridal-wear',
  'officiant-mc',
]

function toCategoryId(category: string | null): VendorCategoryId {
  if (!category) return 'venues'
  const normalised = category.toLowerCase().replace(/[^a-z]+/g, '-')
  return (VALID_CATEGORY_IDS.find((id) => id === normalised) ?? 'venues')
}

function toPriceRangeLabel(price_range: string | null): string {
  if (!price_range) return ''
  const map: Record<string, string> = {
    budget: '$',
    moderate: '$$',
    premium: '$$$',
    luxury: '$$$$',
  }
  return map[price_range] ?? price_range
}

/**
 * Server-side: fetch a single vendor by slug. Returns null if not found,
 * suspended/draft, Supabase env is missing, or any read error occurs (caller
 * falls back to the hardcoded list).
 *
 * The `onboarding_status='active'` gate is intentional — without it, a vendor
 * that's mid-onboarding (or suspended) would still resolve when someone hits
 * `/vendors/<slug>` directly, even though the listing pages hide them.
 *
 * The `vertical='service'` gate is the same idea for vendor TYPE: this
 * directory is for wedding service vendors. Gift-shop and attire/rings vendors
 * are also `active`, but they belong on the registry shop and attire surfaces —
 * without this filter they'd show up here as if they were caterers.
 */
export async function getVendorFromDb(slug: string): Promise<Vendor | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('vendors')
      .select('*, application_snapshot, onboarding_status')
      .eq('slug', slug)
      .eq('onboarding_status', 'active')
      .eq('vertical', 'service')
      .maybeSingle<VendorRow & { onboarding_status: string }>()
    if (error || !data) return null

    // Fetch published reviews + aggregate stats so the detail page renders
    // the rating row and review list from real data only.
    const [statsRes, reviewsRes] = await Promise.all([
      supabase
        .from('vendor_review_stats')
        .select('average_rating, review_count')
        .eq('vendor_id', data.id)
        .maybeSingle<{ average_rating: number; review_count: number }>(),
      supabase
        .from('vendor_reviews')
        .select('id, author_name, rating, body, wedding_date, created_at')
        .eq('vendor_id', data.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50)
        .returns<
          Array<{
            id: string
            author_name: string
            rating: number
            body: string
            wedding_date: string | null
            created_at: string
          }>
        >(),
    ])

    const baseVendor = mapVendorRow(data)

    const detailedReviews: VendorReview[] = (reviewsRes.data ?? []).map((r) => ({
      id: r.id,
      author: r.author_name,
      rating: r.rating,
      text: r.body,
      date: new Date(r.created_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      weddingDate: r.wedding_date ?? undefined,
    }))

    const stats = statsRes.data
    const reviewCount =
      typeof stats?.review_count === 'number' ? stats.review_count : detailedReviews.length
    const rating =
      typeof stats?.average_rating === 'number' ? stats.average_rating : baseVendor.rating

    return {
      ...baseVendor,
      rating,
      reviewCount,
      detailedReviews: detailedReviews.length > 0 ? detailedReviews : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Load every vendor that's `active` in the marketplace. Used by the listing
 * page to surface vendors that completed self-onboarding and were approved
 * by an admin — these don't have a curated `website_vendors` row yet.
 *
 * The merge happens at the listing layer (lib/cms/vendors.ts): curated
 * website_vendors rows take precedence (richer content, hand-tuned hero
 * media), and marketplace-only vendors are appended for any slug not
 * already represented.
 *
 * Scoped to `vertical='service'` — see getVendorFromDb. Product vendors
 * (gift_shop / attire_rings) live on their own surfaces, not this directory.
 */
export async function getActiveMarketplaceVendors(): Promise<Vendor[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return []
  }
  try {
    const supabase = createSupabaseServerClient()
    const [vendorsRes, statsRes] = await Promise.all([
      supabase
        .from('vendors')
        .select('*, application_snapshot')
        .eq('onboarding_status', 'active')
        .eq('vertical', 'service')
        .order('updated_at', { ascending: false }),
      supabase
        .from('vendor_review_stats')
        .select('vendor_id, average_rating, review_count')
        .returns<
          Array<{ vendor_id: string; average_rating: number; review_count: number }>
        >(),
    ])
    if (vendorsRes.error || !vendorsRes.data) return []
    const statsByVendor = new Map<string, { rating: number; count: number }>()
    for (const s of statsRes.data ?? []) {
      statsByVendor.set(s.vendor_id, {
        rating: s.average_rating,
        count: s.review_count,
      })
    }
    return (vendorsRes.data as VendorRow[]).map((row) => {
      const v = mapVendorRow(row)
      const stat = statsByVendor.get(v.id)
      return stat ? { ...v, rating: stat.rating, reviewCount: stat.count } : v
    })
  } catch {
    return []
  }
}

function mapVendorRow(row: VendorRow): Vendor {
  const social = (row.social_links ?? {}) as Record<string, string | null | undefined>
  const s = snap(row)
  const labels = snapLabels(s)

  // --- Services: each entry in `services_offered` is either a slug
  // ("drone"), a JSON-stringified object ('{"id":"drone","title":"drone"}'),
  // or — post-migration-025 — a plain JSONB object. We resolve every shape
  // through the catalogue so couples see "Drone coverage", not the raw id
  // or `{"id":"drone","title":"drone","description":""}`. Snapshot's resolved
  // label list takes precedence when present (it knew the human label at
  // submit time); otherwise we resolve from the column.
  const labeledServices = labels ? snapStrList(labels, 'specialServices') : []
  const customServices = snapStrList(s, 'customServices')
  const rawServiceEntries = Array.isArray(row.services_offered)
    ? row.services_offered
    : []
  const resolvedFromColumn = rawServiceEntries
    .map(resolveServiceLabel)
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
  const services =
    labeledServices.length > 0
      ? [...labeledServices, ...customServices]
      : resolvedFromColumn.length > 0
        ? [...resolvedFromColumn, ...customServices]
        : customServices

  // --- Team: prefer the structured column when populated, otherwise fall
  // through to the snapshot. Empty entries (no name + no role) are dropped.
  const teamFromColumn = (Array.isArray(row.team) ? (row.team as SnapTeamMember[]) : [])
    .filter((m) => (m?.name && m.name.trim()) || (m?.role && m.role.trim()))
    .map((m) => ({
      name: m.name?.trim(),
      role: m.role?.trim(),
      bio: m.bio?.trim(),
      avatar: m.avatar?.trim(),
    }))
  const teamFromSnap = (snapArr(s, 'team') as SnapTeamMember[])
    .filter((m) => (m?.name && m.name.trim()) || (m?.role && m.role.trim()))
    .map((m) => ({
      name: m.name?.trim(),
      role: m.role?.trim(),
      bio: m.bio?.trim(),
      avatar: m.avatar?.trim(),
    }))
  const team =
    teamFromColumn.length > 0
      ? teamFromColumn
      : teamFromSnap.length > 0
        ? teamFromSnap
        : undefined

  // --- FAQs: column wins; snapshot is the fallback. Empty Q/A pairs drop.
  const faqsFromColumn = (Array.isArray(row.faqs) ? (row.faqs as SnapFaq[]) : [])
    .filter((f) => f?.question?.trim() && f?.answer?.trim())
    .map((f) => ({ question: f.question!.trim(), answer: f.answer!.trim() }))
  const faqsFromSnap = (snapArr(s, 'faqs') as SnapFaq[])
    .filter((f) => f?.question?.trim() && f?.answer?.trim())
    .map((f) => ({ question: f.question!.trim(), answer: f.answer!.trim() }))
  const faqs =
    faqsFromColumn.length > 0
      ? faqsFromColumn
      : faqsFromSnap.length > 0
        ? faqsFromSnap
        : undefined

  // --- Awards: the new `vendors.awards` column is plain text; legacy
  // installs sometimes have it as TEXT[]. Snapshot's `awards` field is
  // also free text. Concatenate every non-empty source so the public page
  // shows the longest available recognition write-up.
  const awards: string[] | undefined = (() => {
    const out: string[] = []
    if (typeof row.awards === 'string' && row.awards.trim()) out.push(row.awards.trim())
    else if (Array.isArray(row.awards)) out.push(...(row.awards as unknown[]).filter(
      (x): x is string => typeof x === 'string' && x.trim() !== '',
    ))
    const fromSnap = snapStr(s, 'awards')
    if (out.length === 0 && fromSnap) out.push(fromSnap)
    return out.length > 0 ? out : undefined
  })()

  // --- Packages: prefer the structured `packages` JSONB column (latest
  // edits land here via storefront publish); snapshot is fallback. Each
  // entry is normalised to the public Vendor.pricingDetails shape.
  const normalisePkg = (p: SnapPkg) => ({
    label: p.name!.trim(),
    value: p.price!.trim().toLowerCase().includes('tzs')
      ? p.price!.trim()
      : `TZS ${p.price!.trim()}`,
    services: Array.isArray(p.includes)
      ? p.includes.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : undefined,
    note: p.description?.trim() || undefined,
    // Carry the vendor's custom highlight badge (label + icon + tone) through to
    // the public card. Without this the page falls back to a generic "Most
    // popular" pill and the vendor's chosen label/icon/colour never appear.
    badge:
      p.badge && typeof p.badge === 'object' && p.badge.label?.trim()
        ? {
            label: p.badge.label.trim(),
            icon: p.badge.icon?.trim() || 'star',
            tone: p.badge.tone?.trim() || 'dark',
          }
        : undefined,
  })
  const pkgsFromColumn = (Array.isArray(row.packages) ? (row.packages as SnapPkg[]) : [])
    .filter((p) => p?.name?.trim() && p?.price?.trim())
    .map(normalisePkg)
  const pkgsFromSnap = (snapArr(s, 'packages') as SnapPkg[])
    .filter((p) => p?.name?.trim() && p?.price?.trim())
    .map(normalisePkg)
  const pricingDetails: Vendor['pricingDetails'] =
    pkgsFromColumn.length > 0
      ? pkgsFromColumn
      : pkgsFromSnap.length > 0
        ? pkgsFromSnap
        : undefined

  // --- Languages, style/personality, response time, locally-owned: live
  // only in the snapshot.
  // Languages: column wins (vendor's latest edit), snapshot fallback.
  const languagesFromColumn = Array.isArray(row.languages)
    ? row.languages.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : []
  const languages =
    languagesFromColumn.length > 0
      ? languagesFromColumn
      : labels
        ? snapStrList(labels, 'languages')
        : snapStrList(s, 'languages')

  // Style + personality: column wins, snapshot label fallback (so old
  // vendors still show "Modern" via the resolved label even if the new
  // column is null).
  const style =
    typeof row.style === 'string' && row.style.trim()
      ? row.style
      : snapStr(labels, 'style') ?? snapStr(s, 'style') ?? null
  const personality =
    typeof row.personality === 'string' && row.personality.trim()
      ? row.personality
      : snapStr(labels, 'personality') ?? snapStr(s, 'personality') ?? null

  // Response time: column ("4 hours") wins; snapshot value is the same shape.
  const responseTime = (() => {
    const fromColumn =
      typeof row.response_time_hours === 'string' && row.response_time_hours.trim()
        ? row.response_time_hours
        : null
    const fromSnap = fromColumn ? null : snapStr(s, 'responseTimeHours')
    const value = fromColumn ?? fromSnap
    return value ? `Within ${value}` : null
  })()

  const locallyOwned =
    typeof row.locally_owned === 'boolean' ? row.locally_owned : snapBool(s, 'locallyOwned')

  // --- Service area: the storefront editor writes the structured
  // `home_market` + `service_markets` columns, so those win. Each is a raw
  // market ID resolved to a label here (home market first). Falls back to the
  // snapshot's pre-resolved label list, then to the legacy raw IDs on
  // `vendors.location.serviceMarkets`. Without the column read, vendor edits
  // to their service area never reached this page.
  const homeMarketId =
    typeof row.home_market === 'string' && row.home_market.trim() ? row.home_market.trim() : null
  const serviceMarketIds = Array.isArray(row.service_markets)
    ? row.service_markets.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : []
  const marketsFromColumns = Array.from(
    new Set([...(homeMarketId ? [homeMarketId] : []), ...serviceMarketIds]),
  ).map(marketLabel)
  const labeledMarkets = labels ? snapStrList(labels, 'serviceMarkets') : []
  const rawMarkets = Array.isArray((row.location as Record<string, unknown> | null)?.serviceMarkets)
    ? ((row.location as Record<string, unknown>).serviceMarkets as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        .map(marketLabel)
    : []
  const serviceArea =
    marketsFromColumns.length > 0
      ? marketsFromColumns
      : labeledMarkets.length > 0
        ? labeledMarkets
        : rawMarkets

  // --- Gallery: prefer the new admin-managed `gallery_urls` text[] column,
  // fall back to the legacy `gallery` JSONB column if a vendor still has it.
  // The snapshot doesn't ship image URLs (only counts) since photos go
  // through a separate upload step.
  const gallery = (() => {
    const fromUrls = Array.isArray(row.gallery_urls)
      ? row.gallery_urls.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : []
    if (fromUrls.length > 0) return fromUrls
    return Array.isArray(row.gallery)
      ? (row.gallery as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : undefined
  })()

  // --- Videos: portfolio reels persisted by the vendor portal. Public URLs
  // to uploaded MP4/WebM/MOV in vendor-portfolios plus YouTube/Vimeo embed
  // links. Mirror the gallery validation — non-strings dropped at the
  // boundary so the renderer always has a clean list of URLs to work with.
  const videos = Array.isArray(row.video_urls)
    ? row.video_urls.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : undefined

  // --- Capacity: structured column. Validate that both min and max are
  // numeric before exposing — partial entries get hidden so we don't render
  // "10–undefined guests".
  const capacity: Vendor['capacity'] = (() => {
    const c = row.capacity
    if (c && typeof c.min === 'number' && typeof c.max === 'number' && c.max >= c.min) {
      return { min: c.min, max: c.max }
    }
    return undefined
  })()

  // --- Map coords: only surface when both are set.
  const coordsLocation: Vendor['location'] | undefined =
    typeof row.lat === 'number' && typeof row.lng === 'number'
      ? {
          address: row.location?.address ?? '',
          lat: row.lat,
          lng: row.lng,
        }
      : row.location?.lat != null && row.location?.lng != null
        ? {
            address: row.location.address ?? '',
            lat: row.location.lat,
            lng: row.location.lng,
          }
        : undefined

  const categoryId = toCategoryId(row.category)
  // Real hero only — `cover_image` if uploaded, else the `logo`, else nothing.
  // We pass an empty string to indicate "no media" and let the render layer
  // decide what placeholder UI to show. Synthesised stock photos are not
  // acceptable: the page must reflect what the vendor actually uploaded.
  const heroSrc = row.cover_image ?? row.logo ?? ''

  // Drop any social-link key whose value isn't a real string. An object with
  // all-undefined values would still render the section header in the detail
  // page; returning `undefined` lets that section disappear cleanly.
  const cleanedSocials: Vendor['socialLinks'] = (() => {
    const out: NonNullable<Vendor['socialLinks']> = {}
    if (typeof social.instagram === 'string' && social.instagram.trim()) out.instagram = social.instagram
    if (typeof social.facebook === 'string' && social.facebook.trim()) out.facebook = social.facebook
    if (typeof social.website === 'string' && social.website.trim()) out.website = social.website
    if (typeof social.tiktok === 'string' && social.tiktok.trim()) out.tiktok = social.tiktok
    if (typeof social.whatsapp === 'string' && social.whatsapp.trim()) out.whatsapp = social.whatsapp
    return Object.keys(out).length > 0 ? out : undefined
  })()

  // --- Booking policies: structured columns win, snapshot is the fallback
  // for vendors who submitted before the columns existed. Raw values
  // ("30", "flexible", "one-free") — the render layer maps them to labels.
  const depositPercent = (() => {
    const fromColumn =
      typeof row.deposit_percent === 'string' && row.deposit_percent.trim()
        ? row.deposit_percent.trim()
        : null
    return fromColumn ?? snapStr(s, 'depositPercent') ?? undefined
  })()
  const cancellationLevel = (() => {
    const fromColumn =
      typeof row.cancellation_level === 'string' && row.cancellation_level.trim()
        ? row.cancellation_level.trim()
        : null
    return fromColumn ?? snapStr(s, 'cancellationLevel') ?? undefined
  })()
  const reschedulePolicy = (() => {
    const fromColumn =
      typeof row.reschedule_policy === 'string' && row.reschedule_policy.trim()
        ? row.reschedule_policy.trim()
        : null
    return fromColumn ?? snapStr(s, 'reschedulePolicy') ?? undefined
  })()

  // --- Pricing extras: column wins, snapshot fallback.
  const startingPrice = (() => {
    const fromColumn =
      typeof row.starting_price === 'string' && row.starting_price.trim()
        ? row.starting_price.trim()
        : null
    return fromColumn ?? snapStr(s, 'startingPrice') ?? undefined
  })()
  const customQuotes =
    typeof row.custom_quotes === 'boolean'
      ? row.custom_quotes
      : (snapBool(s, 'customQuotes') ?? undefined)

  // --- Availability: the vendor declares dates as [{ date, status }] where
  // status is "unavailable" (fully booked/off) or "limited" (tight). The public
  // calendar wants booked vs limited date lists. Returns undefined when empty
  // so the detail page hides the calendar rather than inventing one.
  const availability = (() => {
    const raw = Array.isArray(row.availability)
      ? row.availability
      : (snapArr(s, 'availability') as Array<{ date?: string; status?: string }>)
    const bookedDates: string[] = []
    const limitedDates: string[] = []
    for (const e of raw) {
      if (!e || typeof e.date !== 'string' || !e.date.trim()) continue
      if (e.status === 'limited') limitedDates.push(e.date)
      else bookedDates.push(e.date)
    }
    if (bookedDates.length === 0 && limitedDates.length === 0) return undefined
    return { bookedDates, limitedDates, leadTimeWeeks: 0 }
  })()

  return {
    id: row.id,
    slug: row.slug,
    name: row.business_name ?? '',
    logo: row.logo?.trim() ? row.logo : undefined,
    excerpt: row.description ?? row.bio?.slice(0, 160) ?? '',
    category: row.category ?? '',
    categoryId,
    city: row.location?.city ?? '',
    priceRange: toPriceRangeLabel(row.price_range),
    // Ratings and reviews must come from real review data only. New vendors
    // start at 0 reviews — the detail page should hide the rating UI in that
    // state rather than show a fake "0.0 stars" or invent reviews.
    rating: typeof row.stats?.averageRating === 'number' ? row.stats.averageRating : 0,
    reviewCount: typeof row.stats?.reviewCount === 'number' ? row.stats.reviewCount : 0,
    badge: row.verified ? 'Verified' : undefined,
    heroMedia: {
      type: 'image',
      src: heroSrc,
      alt: row.business_name ?? row.slug,
    },
    gallery,
    videos,
    about: row.bio ?? undefined,
    yearsInBusiness:
      typeof row.years_in_business === 'number' ? row.years_in_business : undefined,
    services: services.length > 0 ? services : undefined,
    pricingDetails,
    awards,
    faqs,
    team,
    capacity,
    location: coordsLocation,
    socialLinks: cleanedSocials,
    languages: languages.length > 0 ? languages : undefined,
    serviceArea: serviceArea.length > 0 ? serviceArea : undefined,
    responseTime: responseTime ?? undefined,
    locallyOwned: locallyOwned ?? undefined,
    style: style ?? undefined,
    personality: personality ?? undefined,
    depositPercent,
    cancellationLevel,
    reschedulePolicy,
    startingPrice,
    customQuotes,
    availability,
    hours: (() => {
      // Column wins; snapshot fallback. Normalise to the strict public shape
      // (open boolean, from string, to string) — partial entries become
      // closed days.
      const raw = row.hours ?? snapObj(s, 'hours')
      if (!raw || typeof raw !== 'object') return undefined
      const days: Array<keyof NonNullable<Vendor['hours']>> = [
        'mon',
        'tue',
        'wed',
        'thu',
        'fri',
        'sat',
        'sun',
      ]
      const out: NonNullable<Vendor['hours']> = {} as NonNullable<Vendor['hours']>
      let any = false
      for (const day of days) {
        const e = (raw as Record<string, unknown>)[day]
        if (e && typeof e === 'object') {
          const entry = e as { open?: unknown; from?: unknown; to?: unknown }
          out[day] = {
            open: entry.open === true,
            from: typeof entry.from === 'string' ? entry.from : '',
            to: typeof entry.to === 'string' ? entry.to : '',
          }
          any = true
        }
      }
      return any ? out : undefined
    })(),
    parallelBookingCapacity:
      typeof row.parallel_booking_capacity === 'number'
        ? row.parallel_booking_capacity
        : (() => {
            const fromSnap = s?.parallelBookingCapacity
            return typeof fromSnap === 'number' ? fromSnap : undefined
          })(),
    // `detailedReviews` is layered on by getVendorFromDb() from the real
    // reviews pipeline, so it's intentionally not set here.
  }
}
