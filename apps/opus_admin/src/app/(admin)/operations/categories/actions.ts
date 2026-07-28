'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

export type ActionResult = { ok: true } | { ok: false; error: string }

function authed() {
  return auth().then(({ userId }) => {
    if (!userId) throw new Error('Unauthenticated')
  })
}

async function gate() {
  await authed()
  await requirePermission('vendor.read')
}

export async function addCategory(input: {
  slug: string
  label: string
  profileLabel: string
  dbValue: string
  icon: string
  sortOrder: number
}): Promise<ActionResult> {
  try {
    await gate()
    const slug = input.slug.trim().toLowerCase().replace(/\s+/g, '-')
    if (!slug || !input.label.trim() || !input.dbValue.trim()) {
      return { ok: false, error: 'Slug, label, and display value are required.' }
    }
    const admin = createSupabaseAdminClient()
    const { error } = await admin.from('vendor_categories').insert({
      slug,
      label: input.label.trim(),
      profile_label: input.profileLabel.trim() || input.label.trim(),
      db_value: input.dbValue.trim(),
      icon: input.icon.trim() || 'Tag',
      sort_order: input.sortOrder,
      active: true,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/operations/categories')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateCategory(
  slug: string,
  patch: Partial<{
    label: string
    profileLabel: string
    dbValue: string
    icon: string
    sortOrder: number
    active: boolean
    sellsProducts: boolean
  }>,
): Promise<ActionResult> {
  try {
    await gate()
    const admin = createSupabaseAdminClient()
    const update: Record<string, unknown> = {}
    if (patch.label !== undefined) update.label = patch.label.trim()
    if (patch.profileLabel !== undefined) update.profile_label = patch.profileLabel.trim()
    if (patch.dbValue !== undefined) update.db_value = patch.dbValue.trim()
    if (patch.icon !== undefined) update.icon = patch.icon.trim() || 'Tag'
    if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder
    if (patch.active !== undefined) update.active = patch.active
    if (patch.sellsProducts !== undefined) update.sells_products = patch.sellsProducts
    const { error } = await admin
      .from('vendor_categories')
      .update(update)
      .eq('slug', slug)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/operations/categories')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
