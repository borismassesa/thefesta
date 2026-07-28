import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  OPUS_PASS_DIGITAL_CARDS_FEATURES_FALLBACK,
  type OpusPassDigitalCardsFeaturesContent,
  type OpusPassDigitalCardsFeaturesRow,
} from '@/lib/cms/opus-pass-digital-cards-features'
import FeaturesEditor from './FeaturesEditor'

export const dynamic = 'force-dynamic'

export default async function OpusPassDigitalCardsFeaturesEditorPage() {
  const supabase = createSupabaseAdminClient()
  const { data: row } = await supabase
    .from('website_page_sections')
    .select('*')
    .eq('page_key', 'opus-pass-invitations')
    .eq('section_key', 'features')
    .maybeSingle<OpusPassDigitalCardsFeaturesRow>()
  const stored = (row?.draft_content ?? row?.content) as
    | Partial<OpusPassDigitalCardsFeaturesContent>
    | null
  const initial: OpusPassDigitalCardsFeaturesContent = stored
    ? {
        heading: stored.heading ?? OPUS_PASS_DIGITAL_CARDS_FEATURES_FALLBACK.heading,
        cards:
          stored.cards && Array.isArray(stored.cards) && stored.cards.length > 0
            ? stored.cards
            : OPUS_PASS_DIGITAL_CARDS_FEATURES_FALLBACK.cards,
      }
    : OPUS_PASS_DIGITAL_CARDS_FEATURES_FALLBACK
  const hasDraft = !!row?.draft_content
  return <FeaturesEditor initial={initial} hasDraft={hasDraft} />
}
