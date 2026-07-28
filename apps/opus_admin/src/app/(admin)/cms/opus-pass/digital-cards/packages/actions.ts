'use server'

import { revalidatePath } from 'next/cache'
import { revalidateOpusPass } from '@/lib/revalidate'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import type { OpusPassPackagesContent } from '@/lib/cms/opus-pass-packages'

const PAGE_KEY = 'opus-pass-packages'
const SECTION_KEY = 'wedding-tiers'
const EDITOR_PATH = '/cms/opus-pass/digital-cards/packages'

// Public OpusPass paths that read the packages content (product detail pages are
// force-dynamic and refresh on their own; the catalog/cart cards read the
// "from per-guest price" derived from these tiers and are ISR-cached).
const PUBLIC_PATHS = ['/digital-cards', '/digital-cards/catalog', '/digital-cards/cart']

export async function saveOpusPassPackagesDraft(draft: OpusPassPackagesContent): Promise<void> {
  await requirePermission('cms.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_page_sections')
    .upsert(
      { page_key: PAGE_KEY, section_key: SECTION_KEY, draft_content: draft },
      { onConflict: 'page_key,section_key', ignoreDuplicates: false },
    )
  if (error) throw error
  revalidatePath(EDITOR_PATH)
}

export async function publishOpusPassPackages(): Promise<void> {
  await requirePermission('cms.publish')
  const supabase = createSupabaseAdminClient()
  const { data: row, error: loadErr } = await supabase
    .from('website_page_sections')
    .select('draft_content')
    .eq('page_key', PAGE_KEY)
    .eq('section_key', SECTION_KEY)
    .maybeSingle()
  if (loadErr) throw loadErr
  if (!row?.draft_content) return

  const { error } = await supabase
    .from('website_page_sections')
    .update({ content: row.draft_content, draft_content: null, is_published: true })
    .eq('page_key', PAGE_KEY)
    .eq('section_key', SECTION_KEY)
  if (error) throw error

  revalidatePath(EDITOR_PATH)
  await revalidateOpusPass(...PUBLIC_PATHS)
}

export async function discardOpusPassPackagesDraft(): Promise<void> {
  await requirePermission('cms.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_page_sections')
    .update({ draft_content: null })
    .eq('page_key', PAGE_KEY)
    .eq('section_key', SECTION_KEY)
  if (error) throw error
  revalidatePath(EDITOR_PATH)
}
