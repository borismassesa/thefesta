'use server'

import { revalidatePath } from 'next/cache'
import {
  ProductInputSchema,
  productSlugOf,
  type ProductCategory,
  type ProductInput,
  type ProductRecord,
} from '@opusfesta/lib'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { ensureLiveVendor } from '../sections/actions'

// Product CRUD for vendors in a product vertical (gift_shop, attire_rings).
// Same trust model as every storefront section: ensureLiveVendor() proves the
// caller owns the vendor, then the service-role client writes scoped to that
// vendor id. Content edits reset moderation status to 'pending' — the same
// philosophy as section_status: nothing edited goes public unreviewed.

export type ProductSaveResult =
  | { ok: true; product: ProductRecord }
  | { ok: false; error: string; reason: 'unauth' | 'invalid' | 'unknown' }

export async function loadProducts(): Promise<
  { ok: true; products: ProductRecord[] } | { ok: false }
> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false }
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('products')
    .select('*')
    .eq('vendor_id', guard.vendorId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return { ok: false }
  return { ok: true, products: (data ?? []) as ProductRecord[] }
}

export async function loadProductCategories(): Promise<ProductCategory[]> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('product_categories')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  return (data ?? []) as ProductCategory[]
}

export async function saveProduct(
  input: ProductInput & { id?: string },
): Promise<ProductSaveResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false, reason: 'unauth', error: guard.error }

  const parsed = ProductInputSchema.safeParse({ ...input, id: undefined })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      reason: 'invalid',
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Invalid product.',
    }
  }
  const p = parsed.data

  const admin = createSupabaseAdminClient()
  const row = {
    category_slug: p.category_slug,
    name: p.name.trim(),
    description: p.description?.trim() || null,
    highlights: p.highlights.map((h) => h.trim()).filter(Boolean),
    price_tzs: p.price_tzs,
    compare_at_price_tzs:
      p.compare_at_price_tzs && p.compare_at_price_tzs > p.price_tzs
        ? p.compare_at_price_tzs
        : null,
    images: p.images,
    stock_quantity: p.stock_quantity,
    made_to_order: p.made_to_order,
    published: p.published,
    // Every content edit goes back through moderation — an approved product
    // must not change under the shop's feet.
    status: 'pending' as const,
    rejection_note: null,
  }

  if (input.id) {
    const { data, error } = await admin
      .from('products')
      .update(row)
      .eq('id', input.id)
      .eq('vendor_id', guard.vendorId)
      .select('*')
      .maybeSingle<ProductRecord>()
    if (error || !data) {
      return {
        ok: false,
        reason: 'unknown',
        error: `[products] update failed: ${error?.message ?? 'no matching product'}`,
      }
    }
    revalidatePath('/storefront/products')
    return { ok: true, product: data }
  }

  // Create — slug unique per vendor; suffix on collision.
  const base = productSlugOf(row.name) || 'product'
  let slug = base
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await admin
      .from('products')
      .insert({ ...row, vendor_id: guard.vendorId, slug })
      .select('*')
      .maybeSingle<ProductRecord>()
    if (!error && data) {
      revalidatePath('/storefront/products')
      return { ok: true, product: data }
    }
    if (error?.code === '23505') {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
      continue
    }
    return {
      ok: false,
      reason: 'unknown',
      error: `[products] create failed: ${error?.message ?? 'unknown'}`,
    }
  }
  return { ok: false, reason: 'unknown', error: '[products] could not allocate a unique slug.' }
}

export async function deleteProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false, error: guard.error }
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('products')
    .delete()
    .eq('id', id)
    .eq('vendor_id', guard.vendorId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/storefront/products')
  return { ok: true }
}

/** Vendor's own visibility toggle — does NOT touch moderation status. */
export async function setProductPublished(
  id: string,
  published: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false, error: guard.error }
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('products')
    .update({ published })
    .eq('id', id)
    .eq('vendor_id', guard.vendorId)
    .select('id')
  if (error || !data || data.length === 0) {
    return { ok: false, error: error?.message ?? 'Product not found.' }
  }
  revalidatePath('/storefront/products')
  return { ok: true }
}
