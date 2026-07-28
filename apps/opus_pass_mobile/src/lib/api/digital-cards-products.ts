import type { SupabaseClient } from '@supabase/supabase-js';
import type { DigitalCardProduct } from '@/types/digital-cards';

/**
 * Public catalog table (`"anyone can read invitations products"` RLS policy —
 * see supabase/migrations/20260602000001_tighten_invitations_products_and_page_sections_rls.sql)
 * shared with the apps/opus_pass web storefront. Queried with the plain
 * (unauthenticated) Supabase client, not `useAuthenticatedSupabase()`.
 *
 * Some seed rows only have local web-app asset paths in `image_url`
 * (e.g. `/assets/...`), which aren't reachable from the mobile bundle — those
 * are filtered out here rather than rendering a broken image.
 */
export async function getDigitalCardProducts(
  client: SupabaseClient
): Promise<DigitalCardProduct[]> {
  const { data, error } = await client
    .from('website_invitations_products')
    .select(
      'id, slug, name, designer, category, price_was, price_now, digital_unit_price, image_url, designs, description, badge, sort_order'
    )
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(96);
  if (error) throw error;

  return ((data ?? []) as DigitalCardProduct[])
    .filter((p) => p.image_url?.startsWith('http'))
    .map((p) => ({
      ...p,
      designs: (p.designs ?? []).filter((url) => url?.startsWith('http')),
    }));
}
