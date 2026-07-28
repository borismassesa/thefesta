import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  OPUS_PASS_DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK,
  type OpusPassDigitalCardsExploreStylesContent,
  type OpusPassDigitalCardsExploreStylesRow,
} from '@/lib/cms/opus-pass-digital-cards-explore-styles'
import ExploreStylesEditor from './ExploreStylesEditor'

export const dynamic = 'force-dynamic'

export default async function OpusPassDigitalCardsExploreStylesEditorPage() {
  const supabase = createSupabaseAdminClient()
  const { data: row } = await supabase
    .from('website_page_sections')
    .select('*')
    .eq('page_key', 'opus-pass-invitations')
    .eq('section_key', 'explore-styles')
    .maybeSingle<OpusPassDigitalCardsExploreStylesRow>()
  const stored = (row?.draft_content ?? row?.content) as
    | Partial<OpusPassDigitalCardsExploreStylesContent>
    | null
  const initial: OpusPassDigitalCardsExploreStylesContent = stored
    ? {
        heading: stored.heading ?? OPUS_PASS_DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK.heading,
        columns:
          stored.columns && Array.isArray(stored.columns) && stored.columns.length > 0
            ? stored.columns
            : OPUS_PASS_DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK.columns,
      }
    : OPUS_PASS_DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK
  const hasDraft = !!row?.draft_content
  return <ExploreStylesEditor initial={initial} hasDraft={hasDraft} />
}
