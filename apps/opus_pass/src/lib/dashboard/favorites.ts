import 'server-only'
import { createDashboardClient } from '@/lib/dashboard/supabase'

// Persisted "saved designs" for a couple. Backed by invitation_product_favorites
// (migration 20260720000001), the same table the mobile app writes to — so a
// design liked on the phone shows up here and vice versa. Every query is scoped
// by user_id in code; owner-only RLS is defense-in-depth.

/** Product ids the couple has saved, newest first. */
export async function listFavoriteProductIds(userId: string): Promise<string[]> {
  const supabase = createDashboardClient()
  const { data, error } = await supabase
    .from('invitation_product_favorites')
    .select('product_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[favorites] list failed', error)
    return []
  }
  return (data ?? []).map((row) => row.product_id as string)
}

/**
 * Saves a design for the couple. Idempotent: re-saving an existing favorite is a
 * no-op (ON CONFLICT DO NOTHING) rather than a duplicate-key error. user_id is
 * supplied explicitly — the service-role client carries no JWT, so the table's
 * requesting_user_id() default would resolve to null and violate NOT NULL.
 */
export async function addFavorite(userId: string, productId: string): Promise<void> {
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('invitation_product_favorites')
    .upsert(
      { user_id: userId, product_id: productId },
      { onConflict: 'user_id,product_id', ignoreDuplicates: true },
    )
  if (error) console.error('[favorites] add failed', error)
}

/** Removes a saved design (scoped to its owner). */
export async function removeFavorite(userId: string, productId: string): Promise<void> {
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('invitation_product_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId)
  if (error) console.error('[favorites] remove failed', error)
}
