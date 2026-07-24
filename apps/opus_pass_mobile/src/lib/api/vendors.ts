import { supabase } from '@/lib/supabase';
import type { VendorListing, VendorPackageDetail, VendorReview } from '@/types/vendor';

/** A `reviews` row with its author embedded. */
interface VendorReviewRow {
  id: string;
  vendor_id: string;
  rating: number;
  title: string | null;
  content: string | null;
  event_type: string | null;
  created_at: string;
  users: { name: string | null; avatar: string | null } | null;
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
 * Queries `reviews` directly rather than through the get_vendor_reviews_with_users
 * RPC that of_mobile uses. That RPC is broken server-side: it declares
 * `event_type TEXT` (006_vendor_search_and_optimizations.sql) while the column
 * is varchar(100), so every call fails with 42804 "structure of query does not
 * match function result type". The embedded users join below is permitted by
 * RLS and returns the same shape.
 */
export async function getVendorReviews(vendorId: string): Promise<VendorReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('reviews')
    .select('id, vendor_id, rating, title, content, event_type, created_at, users:user_id (name, avatar)')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as VendorReviewRow[]).map((row) => ({
    id: row.id,
    vendor_id: row.vendor_id,
    rating: row.rating,
    title: row.title,
    content: row.content,
    event_type: row.event_type,
    created_at: row.created_at,
    user: {
      name: row.users?.name || 'Anonymous',
      avatar: row.users?.avatar || null,
    },
  }));
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
