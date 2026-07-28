import { getEvents, getSendInvitesData } from '@/lib/dashboard/queries'
import { resolveEventScope } from '@/lib/dashboard/event-scope'
import { EventChooser } from '@/components/dashboard/EventScope'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { loadDashboardCopy } from '@/lib/cms/dashboard-copy'
import { loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import SendInvitesView from './SendInvitesView'

export const dynamic = 'force-dynamic'

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tab?: string }>
}) {
  const { event: eventParam, tab } = await searchParams
  const locale = await getLocale()

  // Multi-event couples pick which event they're sending for before the
  // send console loads; the choice then follows them via ?event= + cookie.
  const events = await getEvents()
  const scope = await resolveEventScope(events, eventParam)
  if (scope.needsChooser) {
    const scopeStrings = await loadUiStrings('dashboard-event-scope', locale)
    return (
      <div className="space-y-6">
        <EventChooser events={events} strings={scopeStrings} />
      </div>
    )
  }

  const [data, strings, scopeStrings, rsvpsCopy, catalogProducts] = await Promise.all([
    getSendInvitesData(scope.selected?.id, events),
    loadUiStrings('dashboard-send', locale),
    loadUiStrings('dashboard-event-scope', locale),
    loadDashboardCopy('rsvps', locale),
    loadDigitalCardProducts(locale),
  ])
  const saveDateTemplates = catalogProducts
    .filter((product) => (product.imageUrl || product.designs?.[0]) && product.category.toLowerCase().includes('save the date'))
    .map((product) => ({
      id: product.id,
      name: product.name,
      imageUrl: (product.imageUrl || product.designs?.[0])!,
    }))

  return (
    <SendInvitesView
      data={data}
      strings={strings}
      scopeStrings={scopeStrings}
      rsvpsCopy={rsvpsCopy}
      saveDateTemplates={saveDateTemplates}
      initialTab={tab}
    />
  )
}
