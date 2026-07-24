export interface VendorLocation {
  city?: string;
  address?: string;
  street?: string;
  ward?: string;
  district?: string;
  region?: string;
  country?: string;
  landmark?: string;
  houseNumber?: string;
  postalCode?: string;
}

export interface VendorPriceRange {
  min?: number;
  max?: number;
}

export interface VendorStats {
  viewCount?: number;
  inquiryCount?: number;
  saveCount?: number;
  averageRating?: number;
  reviewCount?: number;
}

/**
 * Unset fields come back as empty strings rather than null in production rows,
 * so consumers must treat '' as absent.
 */
export interface VendorContactInfo {
  whatsapp?: string;
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface VendorSocialLinks {
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  whatsapp?: string;
}

export interface VendorTeamMember {
  id: string;
  name: string;
  role?: string;
  bio?: string;
  avatar?: string;
}

export type VendorHoursDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type VendorHours = Partial<Record<VendorHoursDay, { open: boolean; from: string; to: string }>>;

/** Raw shape of the `vendors.availability` jsonb column — one entry per declared date. */
export interface VendorAvailabilityEntry {
  date?: string;
  status?: string;
  note?: string;
}

/**
 * A vendor as returned by the public listing/detail queries (VENDOR_COLUMNS in
 * src/lib/api/vendors.ts). JSON columns (location, price_range, stats, …) are
 * loosely shaped in the DB, so their fields are optional here.
 */
export interface VendorListing {
  id: string;
  slug: string;
  user_id: string;
  business_name: string;
  category: string;
  subcategories: string[] | null;
  bio: string | null;
  description: string | null;
  logo: string | null;
  cover_image: string | null;
  gallery_urls: string[] | null;
  location: VendorLocation | null;
  price_range: VendorPriceRange | null;
  verified: boolean | null;
  tier: string | null;
  stats: VendorStats | null;
  contact_info: VendorContactInfo | null;
  social_links: VendorSocialLinks | null;
  years_in_business: number | null;
  team_size: number | null;
  services_offered: string[] | null;
  team: VendorTeamMember[] | null;
  faqs: VendorFaq[] | null;
  service_markets: string[] | null;
  home_market: string | null;
  languages: string[] | null;
  response_time_hours: string | null;
  locally_owned: boolean | null;
  hours: VendorHours | null;
  availability: VendorAvailabilityEntry[] | null;
  created_at: string;
  updated_at: string;
}

export interface VendorFaq {
  id?: string;
  question: string;
  answer: string;
}

export type SavedVendorStatus = 'saved' | 'contacted' | 'booked' | 'archived';

/**
 * A `saved_vendors` row joined with the summary columns of its vendor. This is
 * also where a couple's "booked" state lives — `vendor_bookings` is a
 * vendor-side pipeline table whose RLS excludes couples entirely.
 */
export interface SavedVendorRow {
  id: string;
  user_id: string;
  vendor_id: string;
  status: SavedVendorStatus | null;
  created_at: string;
  vendors: {
    id: string;
    business_name: string;
    logo: string | null;
    category: string;
    cover_image: string | null;
    location: VendorLocation | null;
    price_range: VendorPriceRange | null;
    stats: VendorStats | null;
  } | null;
}

export interface VendorPackageBadge {
  label: string;
  icon?: string;
  tone?: string;
}

/**
 * A package/tier from the vendors.packages JSON column, shaped to the rows the
 * vendor portal actually writes: `price` is a pre-formatted string
 * ("1,500,000"), inclusions live under `includes`, and the "Popular" highlight
 * is a `badge` object. This deliberately differs from of_mobile's
 * VendorPackageDetail, which does not match production data.
 */
export interface VendorPackageDetail {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  includes?: string[];
  badge?: VendorPackageBadge | null;
}

export type VendorReviewStatus = 'pending' | 'published' | 'rejected';

/**
 * Sourced from `vendor_reviews` — the moderated pipeline the web storefront
 * also reads (see 20260503000002_vendor_reviews_pipeline.sql). `status` is
 * only populated for the signed-in user's own review (RLS only exposes other
 * couples' `published` rows), so the UI can show "your review is pending".
 */
export interface VendorReview {
  id: string;
  vendor_id: string;
  rating: number;
  title: string | null;
  content: string | null;
  event_type: string | null;
  wedding_date: string | null;
  status: VendorReviewStatus;
  created_at: string;
  user: {
    name: string;
    avatar: string | null;
  };
}

export type InquiryStatus = 'pending' | 'responded' | 'accepted' | 'declined' | 'closed';

export type ProposalStatus = 'sent' | 'countered' | 'accepted' | 'declined';

export interface InquiryRow {
  id: string;
  vendor_id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  event_type: string;
  event_date: string | null;
  guest_count: number | null;
  budget: string | null;
  location: string | null;
  message: string;
  status: InquiryStatus;
  vendor_response: string | null;
  responded_at: string | null;
  created_at: string;
  proposal_status: ProposalStatus | null;
  proposal_event_date: string | null;
  proposal_venue: string | null;
  proposal_guest_count: number | null;
  proposal_package: string | null;
  proposal_invoice_amount: number | null;
  proposal_invoice_details: string | null;
  proposal_sent_at: string | null;
  proposal_counter_amount: number | null;
  proposal_counter_message: string | null;
  proposal_countered_at: string | null;
  proposal_accepted_at: string | null;
}
