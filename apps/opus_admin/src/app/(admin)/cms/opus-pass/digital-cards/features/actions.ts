'use server'

import { revalidatePath } from 'next/cache'
import { revalidateOpusPass } from '@/lib/revalidate'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import type { OpusPassDigitalCardsFeaturesContent } from '@/lib/cms/opus-pass-digital-cards-features'

const PAGE_KEY = 'opus-pass-invitations'
const SECTION_KEY = 'features'

export async function saveOpusPassDigitalCardsFeaturesDraft(
  draft: OpusPassDigitalCardsFeaturesContent,
): Promise<void> {
  await requirePermission('cms.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_page_sections')
    .upsert(
      { page_key: PAGE_KEY, section_key: SECTION_KEY, draft_content: draft },
      { onConflict: 'page_key,section_key', ignoreDuplicates: false }
    )
  if (error) throw error
  revalidatePath('/cms/opus-pass/digital-cards/features')
}

export async function publishOpusPassDigitalCardsFeatures(): Promise<void> {
  await requirePermission('cms.publish')
  const supabase = createSupabaseAdminClient()
  const { data: row, error: loadErr } = await supabase
    .from('website_page_sections')
    .select('draft_content')
    .eq('page_key', PAGE_KEY)
    .eq('section_key', SECTION_KEY)
    .single()
  if (loadErr) throw loadErr
  if (!row?.draft_content) return

  const { error } = await supabase
    .from('website_page_sections')
    .update({ content: row.draft_content, draft_content: null, is_published: true })
    .eq('page_key', PAGE_KEY)
    .eq('section_key', SECTION_KEY)
  if (error) throw error

  revalidatePath('/cms/opus-pass/digital-cards/features')
  await revalidateOpusPass('/digital-cards')
}

export async function discardOpusPassDigitalCardsFeaturesDraft(): Promise<void> {
  await requirePermission('cms.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_page_sections')
    .update({ draft_content: null })
    .eq('page_key', PAGE_KEY)
    .eq('section_key', SECTION_KEY)
  if (error) throw error
  revalidatePath('/cms/opus-pass/digital-cards/features')
}
