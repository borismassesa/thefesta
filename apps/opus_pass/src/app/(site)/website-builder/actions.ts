'use server'

import { revalidatePath } from 'next/cache'
import type { SiteDoc } from '@/lib/builder/types'
import { createDashboardClient } from '@/lib/dashboard/supabase'
import { getDashboardUser, requireDashboardUser } from '@/lib/dashboard/auth'
import { enablePublicSharing } from '@/lib/dashboard/actions'

// ─────────────────────────────────────────────────────────────────────────────
//  Website builder — persistence + publishing
//  Mirrors the public-invite pattern (service-role writes, owner-scoped). The
//  built SiteDoc is stored on the couple's row; publishing flips it live at
//  /w/<public_slug>.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Best-effort draft sync. No-ops when signed out (the builder also autosaves to
 * localStorage, which is the fast path). Never throws to the editor.
 */
export async function saveWebsiteDraft(doc: SiteDoc): Promise<{ ok: boolean }> {
  const user = await getDashboardUser()
  if (!user) return { ok: false }
  try {
    const supabase = createDashboardClient()
    const { data: updated } = await supabase
      .from('couple_profiles')
      .update({ website_doc: doc, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .select('id')
    if (!updated || updated.length === 0) {
      await supabase
        .from('couple_profiles')
        .insert({ user_id: user.id, partner1_name: doc.meta.partnerA || 'The Couple', website_doc: doc })
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/**
 * Publish the site: ensure a public slug + sharing is on (reuses
 * enablePublicSharing), store the doc, stamp published. Returns the live slug.
 */
export async function publishWebsite(doc: SiteDoc): Promise<{ slug: string }> {
  const user = await requireDashboardUser() // auth first
  const { slug } = await enablePublicSharing() // ensures slug + public_sharing_enabled (+ row exists)
  const supabase = createDashboardClient()
  const now = new Date().toISOString()
  // Keep the stored doc lean: drop any local base64 data-URL photos (durable
  // uploads are http(s) URLs via uploadWebsitePhoto). composeDoc pads any empty
  // slot from the sample library.
  const cleanPhotos = (doc.meta.photos ?? []).filter((u) => u && !u.startsWith('data:'))
  const cleanDoc: SiteDoc = { ...doc, meta: { ...doc.meta, photos: cleanPhotos } }
  const { error } = await supabase
    .from('couple_profiles')
    .update({ website_doc: cleanDoc, website_published_at: now, updated_at: now })
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath(`/w/${slug}`)
  return { slug }
}

/** Take the site offline (host-revocable kill switch). */
export async function unpublishWebsite(): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('couple_profiles')
    .update({ website_published_at: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
}

/**
 * Upload a hero photo to storage and return its public URL, so the published
 * SiteDoc stores URLs (not base64). Requires sign-in; the editor falls back to
 * a local data URL when this throws.
 */
export async function uploadWebsitePhoto(formData: FormData): Promise<string> {
  const user = await requireDashboardUser()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No image selected')
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  if (file.size > 8 * 1024 * 1024) throw new Error('Image must be 8MB or smaller')

  const supabase = createDashboardClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${user.id}/website-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('pledge-covers')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('pledge-covers').getPublicUrl(path)
  return data.publicUrl
}
