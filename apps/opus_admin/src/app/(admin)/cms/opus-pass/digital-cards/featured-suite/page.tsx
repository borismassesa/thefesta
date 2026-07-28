import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  OPUS_PASS_DIGITAL_CARDS_FEATURED_SUITE_FALLBACK,
  type OpusPassDigitalCardsFeaturedSuiteContent,
  type OpusPassDigitalCardsFeaturedSuiteRow,
} from '@/lib/cms/opus-pass-digital-cards-featured-suite'
import FeaturedSuiteEditor from './FeaturedSuiteEditor'

export const dynamic = 'force-dynamic'

export default async function OpusPassDigitalCardsFeaturedSuiteEditorPage() {
  const supabase = createSupabaseAdminClient()
  const { data: row } = await supabase
    .from('website_page_sections')
    .select('*')
    .eq('page_key', 'opus-pass-invitations')
    .eq('section_key', 'featured-suite')
    .maybeSingle<OpusPassDigitalCardsFeaturedSuiteRow>()
  const stored = (row?.draft_content ?? row?.content) as
    | Partial<OpusPassDigitalCardsFeaturedSuiteContent>
    | null
  const initial: OpusPassDigitalCardsFeaturedSuiteContent = stored
    ? {
        ...OPUS_PASS_DIGITAL_CARDS_FEATURED_SUITE_FALLBACK,
        ...stored,
        trust_strip:
          stored.trust_strip && Array.isArray(stored.trust_strip) && stored.trust_strip.length > 0
            ? stored.trust_strip
            : OPUS_PASS_DIGITAL_CARDS_FEATURED_SUITE_FALLBACK.trust_strip,
      }
    : OPUS_PASS_DIGITAL_CARDS_FEATURED_SUITE_FALLBACK
  const hasDraft = !!row?.draft_content
  return <FeaturedSuiteEditor initial={initial} hasDraft={hasDraft} />
}
