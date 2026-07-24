import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { VendorListing, VendorPackageDetail, VendorReview } from '@/types/vendor';

/** A `vendor_reviews` row — the moderated pipeline the web storefront also reads. */
interface VendorReviewRow {
  id: string;
  vendor_id: string;
  rating: number;
  body: string;
  author_name: string;
  wedding_date: string | null;
  created_at: string;
}

/**
 * Vendor browse/detail reads go through the unauthenticated client: the
 * `vendors` table is publicly readable ("Anyone can view published vendors",
 * 001_initial_schema.sql), and these surfaces are reachable before sign-in.
 */
const VENDOR_COLUMNS = `
  id, slug, user_id, business_name, category, subcategories, bio, description,
  logo, cover_image, gallery_urls, location, price_range, verified, tier, stats, contact_info,
  social_links, years_in_business, team_size, services_offered, team,
  faqs, service_markets, home_market, languages, response_time_hours, locally_owned,
  hours, availability,
  created_at, updated_at
`;

export async function getFeaturedVendors(): Promise<VendorListing[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_COLUMNS)
    .eq('verified', true)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data ?? []) as VendorListing[];
}

export async function getVendorsByCategory(category: string): Promise<VendorListing[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_COLUMNS)
    .eq('category', category)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as VendorListing[];
}

export async function getVendorById(id: string): Promise<VendorListing | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_COLUMNS)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as VendorListing;
}

export async function searchVendors(query: string): Promise<VendorListing[]> {
  if (!supabase) return [];
  const escaped = query.replace(/[%,()]/g, ' ').trim();
  if (!escaped) return [];

  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_COLUMNS)
    .or(`business_name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
    .limit(20);

  if (error) throw error;
  return (data ?? []) as VendorListing[];
}

/**
 * Reads from `vendor_reviews`, not the older `reviews` table — `vendor_reviews`
 * is the moderated pipeline the web storefront's rating and review list
 * actually render from (vendor_review_stats / getVendorFromDb() in
 * apps/opus_website/src/lib/vendors-db.ts). Only `status: 'published'` rows
 * are publicly readable (20260503000002_vendor_reviews_pipeline.sql), so a
 * review submitted from either platform shows on both once approved.
 */
export async function getVendorReviews(vendorId: string): Promise<VendorReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('vendor_reviews')
    .select('id, vendor_id, rating, body, author_name, wedding_date, created_at')
    .eq('vendor_id', vendorId)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as VendorReviewRow[]).map((row) => ({
    id: row.id,
    vendor_id: row.vendor_id,
    rating: row.rating,
    title: null,
    content: row.body,
    event_type: null,
    wedding_date: row.wedding_date,
    status: 'published',
    created_at: row.created_at,
    user: {
      name: row.author_name || 'Anonymous',
      avatar: null,
    },
  }));
}

export interface CreateVendorReviewPayload {
  vendorId: string;
  userId: string;
  authorName: string;
  authorEmail: string;
  rating: number;
  body: string;
  weddingDate?: string | null;
}

/**
 * Submits into the same `vendor_reviews` pipeline web writes to, via the
 * Clerk-authenticated client so RLS can attribute the row to `user_id`
 * (20260724180000_vendor_reviews_app_submissions.sql). Always lands
 * `status: 'pending'` — the INSERT policy rejects anything else, same as
 * web's moderation queue. A repeat submission for a vendor the user already
 * reviewed throws Postgres 23505 (unique violation); callers should catch
 * that and show a friendly "you already reviewed this vendor" message.
 */
export async function createVendorReview(
  client: SupabaseClient,
  payload: CreateVendorReviewPayload,
): Promise<void> {
  const { error } = await client.from('vendor_reviews').insert({
    vendor_id: payload.vendorId,
    user_id: payload.userId,
    author_name: payload.authorName,
    author_email: payload.authorEmail,
    rating: payload.rating,
    body: payload.body,
    wedding_date: payload.weddingDate ?? null,
    status: 'pending',
  });

  if (error) throw error;
}

export async function getVendorPackages(vendorId: string): Promise<VendorPackageDetail[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('vendors')
    .select('packages')
    .eq('id', vendorId)
    .single();

  if (error) throw error;
  return (data?.packages ?? []) as VendorPackageDetail[];
}

export async function getCategoryCounts(): Promise<Record<string, number>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('vendors').select('category').eq('verified', true);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { category: string }[]) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return counts;
}
