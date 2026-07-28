import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  OPUS_PASS_PRODUCT_ADDONS_FAQ_FALLBACK,
  type ProductAddonsFaqContent,
  type ProductAddonsFaqRow,
} from '@/lib/cms/opus-pass-product-addons-faq'
import AddonsFaqEditor from './AddonsFaqEditor'

export const dynamic = 'force-dynamic'

const PAGE_KEY = 'opus-pass-product-detail'
const SECTION_KEY = 'addons-faq'

export default async function OpusPassAddonsFaqEditorPage() {
  const supabase = createSupabaseAdminClient()
  const { data: row } = await supabase
    .from('website_page_sections')
    .select('*')
    .eq('page_key', PAGE_KEY)
    .eq('section_key', SECTION_KEY)
    .maybeSingle<ProductAddonsFaqRow>()

  const stored = (row?.draft_content ?? row?.content) as Partial<ProductAddonsFaqContent> | null
  const fb = OPUS_PASS_PRODUCT_ADDONS_FAQ_FALLBACK
  const initial: ProductAddonsFaqContent = stored
    ? {
        addonsHeading: stored.addonsHeading ?? fb.addonsHeading,
        addonsHeading_sw: stored.addonsHeading_sw ?? fb.addonsHeading_sw,
        includedPillLabel: stored.includedPillLabel ?? fb.includedPillLabel,
        includedPillLabel_sw: stored.includedPillLabel_sw ?? fb.includedPillLabel_sw,
        priceFromLabel: stored.priceFromLabel ?? fb.priceFromLabel,
        priceFromLabel_sw: stored.priceFromLabel_sw ?? fb.priceFromLabel_sw,
        howManyLabel: stored.howManyLabel ?? fb.howManyLabel,
        howManyLabel_sw: stored.howManyLabel_sw ?? fb.howManyLabel_sw,
        quotePhoneNumber: stored.quotePhoneNumber ?? fb.quotePhoneNumber,
        descriptionLabel: stored.descriptionLabel ?? fb.descriptionLabel,
        descriptionLabel_sw: stored.descriptionLabel_sw ?? fb.descriptionLabel_sw,
        readMoreLabel: stored.readMoreLabel ?? fb.readMoreLabel,
        readMoreLabel_sw: stored.readMoreLabel_sw ?? fb.readMoreLabel_sw,
        readLessLabel: stored.readLessLabel ?? fb.readLessLabel,
        readLessLabel_sw: stored.readLessLabel_sw ?? fb.readLessLabel_sw,
        similarDesignsHeading: stored.similarDesignsHeading ?? fb.similarDesignsHeading,
        similarDesignsHeading_sw: stored.similarDesignsHeading_sw ?? fb.similarDesignsHeading_sw,
        // An empty array is a deliberate choice, not a missing field — only
        // fall back when the key is absent entirely (legacy rows saved
        // before this field existed).
        addons: Array.isArray(stored.addons) ? stored.addons : fb.addons,
        faq: Array.isArray(stored.faq) ? stored.faq : fb.faq,
      }
    : fb

  return <AddonsFaqEditor initial={initial} hasDraft={!!row?.draft_content} />
}
