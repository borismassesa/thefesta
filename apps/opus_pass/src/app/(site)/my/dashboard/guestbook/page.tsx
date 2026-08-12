import { getEvents, getGuestbookEntries, getGuestbookShareInfo } from '@/lib/dashboard/queries'
import { resolveEventScope } from '@/lib/dashboard/event-scope'
import { EventChooser } from '@/components/dashboard/EventScope'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import GuestbookClient from './GuestbookClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Guestbook',
}

export default async function GuestbookPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const { event: eventParam } = await searchParams
  const locale = await getLocale()
  const [events, scopeStrings] = await Promise.all([getEvents(), loadUiStrings('dashboard-event-scope', locale)])

  // Multi-event couples pick which event's guestbook they're viewing before
  // anything loads; the choice then follows them via ?event= + cookie, same
  // as Pledges/Guests/RSVPs/Seating/Gift Registry.
  const scope = await resolveEventScope(events, eventParam)
  if (scope.needsChooser) {
    return (
      <div className="space-y-6">
        <EventChooser events={events} strings={scopeStrings} />
      </div>
    )
  }

  const selectedEventId = scope.selected?.id ?? null
  const [entries, share] = await Promise.all([
    getGuestbookEntries(selectedEventId),
    selectedEventId ? getGuestbookShareInfo(selectedEventId) : Promise.resolve({ slug: null, enabled: false }),
  ])
  // The link is built client-side from window.location.origin (see
  // ShareLinkCard) rather than publicOrigin() here, so it resolves to
  // localhost while developing instead of always pointing at production.
  return (
    <GuestbookClient
      initial={entries}
      shareSlug={share.slug}
      shareEnabled={share.enabled}
      events={events.map((e) => ({ id: e.id, name: e.name }))}
      selectedEventId={selectedEventId}
      scopeStrings={scopeStrings}
    />
  )
}
