'use server'

import { revalidatePath } from 'next/cache'
import { revalidateOpusPass } from '@/lib/revalidate'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import type { MaybeLocalized } from '@/lib/cms/localized'
import {
  DIGITAL_CARDS_NAVBAR_PAGE_KEY,
  NAVBAR_SECTION_KEY,
} from '@/lib/cms/opus-pass-digital-cards-navbar'

type NavbarDraft = Record<string, MaybeLocalized>

const ADMIN_PATH = '/cms/opus-pass/digital-cards/navbar'

export async function saveNavbarDraft(draft: NavbarDraft): Promise<void> {
  await requirePermission('cms.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_page_sections')
    .upsert(
      {
        page_key: DIGITAL_CARDS_NAVBAR_PAGE_KEY,
        section_key: NAVBAR_SECTION_KEY,
        draft_content: draft,
      },
      { onConflict: 'page_key,section_key', ignoreDuplicates: false },
    )
  if (error) throw error
  revalidatePath(ADMIN_PATH)
}

export async function publishNavbar(): Promise<void> {
  await requirePermission('cms.publish')
  const supabase = createSupabaseAdminClient()
  const { data: row, error: loadErr } = await supabase
    .from('website_page_sections')
    .select('draft_content')
    .eq('page_key', DIGITAL_CARDS_NAVBAR_PAGE_KEY)
    .eq('section_key', NAVBAR_SECTION_KEY)
    .single()
  if (loadErr) throw loadErr
  if (!row?.draft_content) {
    throw new Error('No draft to publish. Save changes first.')
  }

  const { error } = await supabase
    .from('website_page_sections')
    .update({ content: row.draft_content, draft_content: null, is_published: true })
    .eq('page_key', DIGITAL_CARDS_NAVBAR_PAGE_KEY)
    .eq('section_key', NAVBAR_SECTION_KEY)
  if (error) throw error

  revalidatePath(ADMIN_PATH)
  // The navbar renders on every public page — revalidate the home page.
  await revalidateOpusPass('/')
}

export async function discardNavbarDraft(): Promise<void> {
  await requirePermission('cms.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_page_sections')
    .update({ draft_content: null })
    .eq('page_key', DIGITAL_CARDS_NAVBAR_PAGE_KEY)
    .eq('section_key', NAVBAR_SECTION_KEY)
  if (error) throw error
  revalidatePath(ADMIN_PATH)
}
