import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * `invitation_product_favorites` — owner-only RLS via `requesting_user_id()`
 * (see supabase/migrations/20260720000001_opuspass_invitation_product_favorites.sql).
 * `user_id` defaults server-side from the Clerk JWT, so callers never send it.
 */
export async function getLikedProductIds(
  client: SupabaseClient
): Promise<string[]> {
  const { data, error } = await client
    .from('invitation_product_favorites')
    .select('product_id');
  if (error) throw error;
  return (data ?? []).map((row) => row.product_id as string);
}

export async function addFavorite(
  client: SupabaseClient,
  productId: string
): Promise<void> {
  const { error } = await client
    .from('invitation_product_favorites')
    .upsert(
      { product_id: productId },
      { onConflict: 'user_id,product_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function removeFavorite(
  client: SupabaseClient,
  productId: string
): Promise<void> {
  const { error } = await client
    .from('invitation_product_favorites')
    .delete()
    .eq('product_id', productId);
  if (error) throw error;
}
