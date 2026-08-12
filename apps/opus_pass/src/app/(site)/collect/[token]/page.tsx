import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createDashboardClient } from '@/lib/dashboard/supabase'
import { resolveCollectorEventContent, type PledgePageConfig } from '@/lib/dashboard/pledge-page'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { UIStringsProvider } from '@/components/providers/UIStringsProvider'
import CollectorForm from './CollectorForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ event?: string }>
}

interface CoupleSummary {
  userId: string
  coupleName: string
  config: PledgePageConfig
}

/** `eventId` is only used to pick the right per-event cover/wording/questions
 *  (see resolveCollectorEventContent) — couples with a bare, un-tagged link
 *  (0 or 1 events, or an older link) pass `null` and get the couple-wide
 *  legacy config, same as before event scoping existed. */
async function loadCouple(token: string, eventId: string | null): Promise<CoupleSummary | null> {
  const supabase = createDashboardClient()
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('id')
    .eq('collector_token', token)
    .maybeSingle<{ id: string }>()
  if (ownerErr) {
    console.error('[collect] owner lookup failed', ownerErr)
    throw ownerErr
  }
  if (!owner) return null

  const { data: profile, error: profileErr } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name, collector_page')
    .eq('user_id', owner.id)
    .maybeSingle<{
      partner1_name: string | null
      partner2_name: string | null
      collector_page: PledgePageConfig | null
    }>()
  if (profileErr) {
    console.error('[collect] couple profile load failed', profileErr)
    throw profileErr
  }

  const { data: primaryEvent } = await supabase
    .from('wedding_events')
    .select('name')
    .eq('user_id', owner.id)
    .order('sort_order', { ascending: true })
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ name: string | null }>()

  const names = [profile?.partner1_name, profile?.partner2_name].filter(Boolean)
  const coupleName = names.length ? names.join(' & ') : primaryEvent?.name?.trim() || 'The Couple'
  const storedPage = profile?.collector_page ?? {}

  return {
    userId: owner.id,
    coupleName,
    config: { ...storedPage, ...resolveCollectorEventContent(storedPage, eventId) },
  }
}

export default async function CollectorPage({ params, searchParams }: PageProps) {
  const { token } = await params
  const { event: eventId } = await searchParams
  const couple = await loadCouple(token, eventId ?? null)
  if (!couple) notFound()
  const locale = await getLocale()
  const formsCollect = await loadUiStrings('forms-collect', locale)
  return (
    <UIStringsProvider bundles={{ 'forms-collect': formsCollect }}>
      <CollectorForm
        token={token}
        coupleName={couple.coupleName}
        config={couple.config}
        eventId={eventId ?? null}
        locale={locale}
      />
    </UIStringsProvider>
  )
}
