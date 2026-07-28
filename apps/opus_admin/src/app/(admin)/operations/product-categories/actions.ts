'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

export type ActionResult = { ok: true } | { ok: false; error: string }

async function gate() {
  const { userId } = await auth()
  if (!userId) throw new Error('Sign in first.')
  await requirePermission('vendor.moderate')
}

export async function addProductCategory(input: {
  slug: string
  label: string
  icon: string
  sortOrder: number
}): Promise<ActionResult> {
  try {
    await gate()
    const slug = input.slug.trim().toLowerCase().replace(/\s+/g, '-')
    if (!slug || !input.label.trim()) {
      return { ok: false, error: 'Slug and label are required.' }
    }
    const admin = createSupabaseAdminClient()
    const { error } = await admin.from('product_categories').insert({
      slug,
      label: input.label.trim(),
      icon: input.icon.trim() || 'Gift',
      sort_order: input.sortOrder,
      active: true,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/operations/product-categories')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateProductCategory(
  slug: string,
  patch: Partial<{ label: string; icon: string; sortOrder: number; active: boolean }>,
): Promise<ActionResult> {
  try {
    await gate()
    const admin = createSupabaseAdminClient()
    const update: Record<string, unknown> = {}
    if (patch.label !== undefined) update.label = patch.label.trim()
    if (patch.icon !== undefined) update.icon = patch.icon.trim() || 'Gift'
    if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder
    if (patch.active !== undefined) update.active = patch.active
    const { error } = await admin.from('product_categories').update(update).eq('slug', slug)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/operations/product-categories')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteProductCategory(slug: string): Promise<ActionResult> {
  try {
    await gate()
    const admin = createSupabaseAdminClient()
    // Products referencing this category keep their (now-dangling) slug; the FK
    // is ON DELETE unset in schema, so guard against orphaning by refusing when
    // products still use it.
    const { count } = await admin
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_slug', slug)
    if ((count ?? 0) > 0) {
      return { ok: false, error: `${count} product(s) use this category. Reassign them first.` }
    }
    const { error } = await admin.from('product_categories').delete().eq('slug', slug)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/operations/product-categories')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
