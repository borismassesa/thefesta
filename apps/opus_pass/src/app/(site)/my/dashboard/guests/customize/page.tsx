import {
  getMyCollectorToken,
  getMyCollectorPageConfig,
  getCoupleProfile,
  coupleDisplayName,
  getEvents,
} from '@/lib/dashboard/queries'
import { resolveEventScope } from '@/lib/dashboard/event-scope'
import { EventChooser } from '@/components/dashboard/EventScope'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import CollectorCustomizeClient from './CollectorCustomizeClient'

export const dynamic = 'force-dynamic'

export default async function CollectorCustomizePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const { event: eventParam } = await searchParams
  const locale = await getLocale()
  const [events, scopeStrings] = await Promise.all([
    getEvents(),
    loadUiStrings('dashboard-event-scope', locale),
  ])

  // Each event gets its own independent Contact Collector content, so a
  // multi-event couple picks which one they're editing before anything
  // loads — same pattern as Pledges/Send invites/Guests/RSVPs.
  const scope = await resolveEventScope(events, eventParam)
  if (scope.needsChooser) {
    return (
      <div className="space-y-6">
        <EventChooser events={events} strings={scopeStrings} />
      </div>
    )
  }
  const selectedEventId = scope.selected?.id ?? null

  const [collectorToken, pageConfig, profile] = await Promise.all([
    getMyCollectorToken(),
    getMyCollectorPageConfig(),
    getCoupleProfile(),
  ])
  return (
    <CollectorCustomizeClient
      // Remount on event switch — cfg/baseline are derived from props once
      // via useState and never re-sync on their own; a fresh key forces a
      // re-initialize from the newly selected event's actual content instead
      // of showing the previous event's (mirrors PledgesManager's InviteSection).
      key={selectedEventId ?? 'no-event'}
      collectorToken={collectorToken}
      initialConfig={pageConfig}
      coupleName={coupleDisplayName(profile)}
      events={events.map((e) => ({ id: e.id, name: e.name }))}
      selectedEventId={selectedEventId}
      scopeStrings={scopeStrings}
    />
  )
}
