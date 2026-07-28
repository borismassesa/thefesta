import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  OPUS_PASS_PACKAGES_FALLBACK,
  type OpusPassPackagesContent,
  type OpusPassPackagesRow,
} from '@/lib/cms/opus-pass-packages'
import PackagesEditor from './PackagesEditor'

export const dynamic = 'force-dynamic'

const PAGE_KEY = 'opus-pass-packages'
const SECTION_KEY = 'wedding-tiers'

export default async function OpusPassPackagesEditorPage() {
  const supabase = createSupabaseAdminClient()
  const { data: row } = await supabase
    .from('website_page_sections')
    .select('*')
    .eq('page_key', PAGE_KEY)
    .eq('section_key', SECTION_KEY)
    .maybeSingle<OpusPassPackagesRow>()

  const stored = (row?.draft_content ?? row?.content) as Partial<OpusPassPackagesContent> | null
  const fb = OPUS_PASS_PACKAGES_FALLBACK
  const initial: OpusPassPackagesContent = stored
    ? {
        heading: stored.heading ?? fb.heading,
        heading_sw: stored.heading_sw ?? fb.heading_sw,
        subheading: stored.subheading ?? fb.subheading,
        subheading_sw: stored.subheading_sw ?? fb.subheading_sw,
        note: stored.note ?? fb.note,
        note_sw: stored.note_sw ?? fb.note_sw,
        perGuestLabel: stored.perGuestLabel ?? fb.perGuestLabel,
        perGuestLabel_sw: stored.perGuestLabel_sw ?? fb.perGuestLabel_sw,
        perDesignLabel: stored.perDesignLabel ?? fb.perDesignLabel,
        perDesignLabel_sw: stored.perDesignLabel_sw ?? fb.perDesignLabel_sw,
        fromLabel: stored.fromLabel ?? fb.fromLabel,
        fromLabel_sw: stored.fromLabel_sw ?? fb.fromLabel_sw,
        cardsCountLabel: stored.cardsCountLabel ?? fb.cardsCountLabel,
        cardsCountLabel_sw: stored.cardsCountLabel_sw ?? fb.cardsCountLabel_sw,
        minGuestsTemplate: stored.minGuestsTemplate ?? fb.minGuestsTemplate,
        minGuestsTemplate_sw: stored.minGuestsTemplate_sw ?? fb.minGuestsTemplate_sw,
        includesSuffixLabel: stored.includesSuffixLabel ?? fb.includesSuffixLabel,
        includesSuffixLabel_sw: stored.includesSuffixLabel_sw ?? fb.includesSuffixLabel_sw,
        tiers: Array.isArray(stored.tiers) && stored.tiers.length > 0 ? stored.tiers : fb.tiers,
        addons: Array.isArray(stored.addons) ? stored.addons : fb.addons,
      }
    : fb

  return <PackagesEditor initial={initial} hasDraft={!!row?.draft_content} />
}
