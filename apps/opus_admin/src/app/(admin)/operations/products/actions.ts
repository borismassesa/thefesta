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

export async function approveProduct(productId: string): Promise<ActionResult> {
  try {
    await gate()
    const admin = createSupabaseAdminClient()
    const { error } = await admin
      .from('products')
      .update({ status: 'approved', rejection_note: null })
      .eq('id', productId)
    if (error) return { ok: false, error: `${error.code} ${error.message}` }
    revalidatePath('/operations/products')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function rejectProduct(productId: string, note: string): Promise<ActionResult> {
  try {
    await gate()
    const reason = note.trim()
    if (!reason) return { ok: false, error: 'A rejection reason is required.' }
    const admin = createSupabaseAdminClient()
    const { error } = await admin
      .from('products')
      .update({ status: 'rejected', rejection_note: reason.slice(0, 500) })
      .eq('id', productId)
    if (error) return { ok: false, error: `${error.code} ${error.message}` }
    revalidatePath('/operations/products')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
