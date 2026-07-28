import { createSupabaseAdminClient } from '@/lib/supabase'
import type { MaybeLocalized } from '@/lib/cms/localized'
import {
  DIGITAL_CARDS_NAVBAR_FALLBACK,
  DIGITAL_CARDS_NAVBAR_PAGE_KEY,
  NAVBAR_SECTION_KEY,
} from '@/lib/cms/opus-pass-digital-cards-navbar'
import NavbarEditor from './NavbarEditor'

export const dynamic = 'force-dynamic'

type Row = {
  content: Record<string, MaybeLocalized> | null
  draft_content: Record<string, MaybeLocalized> | null
}

export default async function DigitalCardsNavbarEditorPage() {
  const supabase = createSupabaseAdminClient()
  const { data: row } = await supabase
    .from('website_page_sections')
    .select('content, draft_content')
    .eq('page_key', DIGITAL_CARDS_NAVBAR_PAGE_KEY)
    .eq('section_key', NAVBAR_SECTION_KEY)
    .maybeSingle<Row>()

  const stored = (row?.draft_content ?? row?.content ?? {}) as Record<string, MaybeLocalized>
  const initial: Record<string, MaybeLocalized> = { ...DIGITAL_CARDS_NAVBAR_FALLBACK, ...stored }
  const hasDraft = !!row?.draft_content

  return <NavbarEditor initial={initial} hasDraft={hasDraft} />
}
