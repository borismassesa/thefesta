import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  OPUS_PASS_DIGITAL_CARDS_CATEGORIES_FALLBACK,
  type OpusPassDigitalCardsCategoriesContent,
  type OpusPassDigitalCardsCategoriesRow,
} from '@/lib/cms/opus-pass-digital-cards-categories'
import CategoriesEditor from './CategoriesEditor'

export const dynamic = 'force-dynamic'

export default async function OpusPassDigitalCardsCategoriesEditorPage() {
  const supabase = createSupabaseAdminClient()
  const { data: row } = await supabase
    .from('website_page_sections')
    .select('*')
    .eq('page_key', 'opus-pass-invitations')
    .eq('section_key', 'categories')
    .maybeSingle<OpusPassDigitalCardsCategoriesRow>()
  const stored = (row?.draft_content ?? row?.content) as
    | Partial<OpusPassDigitalCardsCategoriesContent>
    | null
  const initial: OpusPassDigitalCardsCategoriesContent = stored
    ? {
        heading: stored.heading ?? OPUS_PASS_DIGITAL_CARDS_CATEGORIES_FALLBACK.heading,
        description: stored.description ?? OPUS_PASS_DIGITAL_CARDS_CATEGORIES_FALLBACK.description,
        categories:
          stored.categories && Array.isArray(stored.categories) && stored.categories.length > 0
            ? stored.categories
            : OPUS_PASS_DIGITAL_CARDS_CATEGORIES_FALLBACK.categories,
      }
    : OPUS_PASS_DIGITAL_CARDS_CATEGORIES_FALLBACK
  const hasDraft = !!row?.draft_content
  return <CategoriesEditor initial={initial} hasDraft={hasDraft} />
}
