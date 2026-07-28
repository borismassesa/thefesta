'use server'

import { revalidatePath } from 'next/cache'
import { revalidateOpusPass } from '@/lib/revalidate'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requireAdminRole, type AdminAccessRole } from '@/lib/admin-auth'
import type { DigitalCardProductRecord } from '@/lib/cms/opus-pass-digital-cards-products'

// Same role allowlist as /lib/cms/upload-media.ts — keep them in sync.
const PRODUCT_EDIT_ROLES: AdminAccessRole[] = ['owner', 'admin', 'editor']

type DbError = { code?: string | null; message?: string | null; details?: string | null }

// Turn a raw Postgres/Supabase error into a human message. Without this the UI
// renders the raw `{code, details, hint, message}` object.
function friendlyDbError(error: DbError, fallback = 'Something went wrong. Please try again.'): string {
  switch (error.code) {
    case '23505': {
      // unique_violation — the only unique business field on a card is its slug.
      const onSlug = `${error.details ?? ''} ${error.message ?? ''}`.includes('slug')
      return onSlug
        ? 'A card with that slug already exists — pick a different slug.'
        : 'That value is already used by another card.'
    }
    case '23502':
      return 'A required field is missing. Please fill it in and try again.'
    case '23503':
      return 'This card references something that no longer exists.'
    default:
      return error.message?.trim() || fallback
  }
}

async function revalidateProductPaths(id?: string): Promise<void> {
  revalidatePath('/cms/opus-pass/digital-cards/products')
  if (id) revalidatePath(`/cms/opus-pass/digital-cards/products/${id}`)
  const passPaths = ['/digital-cards', '/digital-cards/catalog']
  if (id) passPaths.push(`/digital-cards/p/${id}`)
  await revalidateOpusPass(...passPaths)
}

export async function upsertDigitalCardProduct(
  product: DigitalCardProductRecord,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdminRole(PRODUCT_EDIT_ROLES)
  const supabase = createSupabaseAdminClient()
  // DB manages timestamps.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { created_at, updated_at, ...body } = product

  const { data, error } = await supabase
    .from('website_invitations_products')
    .upsert(body, { onConflict: 'id' })
    .select('id')
    .single()
  // Return (don't throw) the friendly message — returned values survive the
  // server-action boundary intact, whereas thrown errors get redacted in prod.
  if (error) return { ok: false, error: friendlyDbError(error) }

  await revalidateProductPaths(data.id)
  return { ok: true, id: data.id }
}

export async function patchDigitalCardProduct(
  id: string,
  patch: Partial<Pick<DigitalCardProductRecord, 'published' | 'sort_order' | 'free_sample'>>,
): Promise<void> {
  await requireAdminRole(PRODUCT_EDIT_ROLES)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_invitations_products')
    .update(patch)
    .eq('id', id)
  if (error) throw new Error(friendlyDbError(error))

  await revalidateProductPaths(id)
}

export async function deleteDigitalCardProduct(id: string): Promise<void> {
  await requireAdminRole(PRODUCT_EDIT_ROLES)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_invitations_products')
    .delete()
    .eq('id', id)
  if (error) throw new Error(friendlyDbError(error))

  await revalidateProductPaths(id)
}
