import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  OPUS_PASS_DIGITAL_CARDS_PROMO_BANNER_FALLBACK,
  type OpusPassDigitalCardsPromoBannerContent,
  type OpusPassDigitalCardsPromoBannerRow,
} from '@/lib/cms/opus-pass-digital-cards-promo-banner'
import PromoBannerEditor from './PromoBannerEditor'

export const dynamic = 'force-dynamic'

export default async function OpusPassDigitalCardsPromoBannerEditorPage() {
  const supabase = createSupabaseAdminClient()
  const { data: row } = await supabase
    .from('website_page_sections')
    .select('*')
    .eq('page_key', 'opus-pass-invitations')
    .eq('section_key', 'promo-banner')
    .maybeSingle<OpusPassDigitalCardsPromoBannerRow>()
  const stored = (row?.draft_content ?? row?.content) as
    | Partial<OpusPassDigitalCardsPromoBannerContent>
    | null
  const initial: OpusPassDigitalCardsPromoBannerContent = stored
    ? { ...OPUS_PASS_DIGITAL_CARDS_PROMO_BANNER_FALLBACK, ...stored }
    : OPUS_PASS_DIGITAL_CARDS_PROMO_BANNER_FALLBACK
  const hasDraft = !!row?.draft_content
  return <PromoBannerEditor initial={initial} hasDraft={hasDraft} />
}
