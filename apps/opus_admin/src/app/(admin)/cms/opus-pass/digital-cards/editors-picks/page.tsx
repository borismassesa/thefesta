import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  OPUS_PASS_DIGITAL_CARDS_EDITORS_PICKS_FALLBACK,
  type OpusPassDigitalCardsEditorsPicksContent,
  type OpusPassDigitalCardsEditorsPicksRowSection,
} from '@/lib/cms/opus-pass-digital-cards-editors-picks'
import EditorsPicksEditor from './EditorsPicksEditor'

export const dynamic = 'force-dynamic'

export default async function OpusPassDigitalCardsEditorsPicksEditorPage() {
  const supabase = createSupabaseAdminClient()
  const { data: row } = await supabase
    .from('website_page_sections')
    .select('*')
    .eq('page_key', 'opus-pass-invitations')
    .eq('section_key', 'editors-picks')
    .maybeSingle<OpusPassDigitalCardsEditorsPicksRowSection>()
  const stored = (row?.draft_content ?? row?.content) as
    | Partial<OpusPassDigitalCardsEditorsPicksContent>
    | null
  const initial: OpusPassDigitalCardsEditorsPicksContent =
    stored?.rows && Array.isArray(stored.rows) && stored.rows.length > 0
      ? {
          rows: stored.rows,
          exploreLabel:
            stored.exploreLabel ?? OPUS_PASS_DIGITAL_CARDS_EDITORS_PICKS_FALLBACK.exploreLabel,
        }
      : OPUS_PASS_DIGITAL_CARDS_EDITORS_PICKS_FALLBACK
  const hasDraft = !!row?.draft_content
  return <EditorsPicksEditor initial={initial} hasDraft={hasDraft} />
}
