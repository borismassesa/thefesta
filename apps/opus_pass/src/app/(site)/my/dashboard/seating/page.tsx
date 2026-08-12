import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarPlus } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/primitives'
import { Button } from '@/components/dashboard/controls'
import { getEvents, getSeatingData } from '@/lib/dashboard/queries'
import { resolveEventScope } from '@/lib/dashboard/event-scope'
import { EventChooser, EventPicker } from '@/components/dashboard/EventScope'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import type { DashboardSeatingStrings } from '@/lib/cms/ui-strings-fallback'
import SeatingPlanner from './SeatingPlanner'

export const dynamic = 'force-dynamic'

export default async function SeatingPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const { event: eventParam } = await searchParams
  const locale = await getLocale()
  const strings = await loadUiStrings('dashboard-seating', locale)
  const scopeStrings = await loadUiStrings('dashboard-event-scope', locale)
  const events = await getEvents()

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <Header strings={strings} />
        <EmptyState
          icon={<CalendarPlus className="h-7 w-7" />}
          title={strings.no_event_title}
          description={strings.no_event_description}
          action={
            <Link href="/my/dashboard/events">
              <Button>
                <CalendarPlus className="h-4 w-4" /> {strings.no_event_cta}
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  // Multi-event couples explicitly choose an event before planning seats;
  // the selection then follows them across sections via ?event= + cookie.
  const scope = await resolveEventScope(events, eventParam)
  if (scope.needsChooser) {
    return (
      <div className="space-y-6">
        <Header strings={strings} />
        <EventChooser events={events} strings={scopeStrings} />
      </div>
    )
  }

  const selectedId = scope.selected?.id ?? events[0].id
  const seating = await getSeatingData(selectedId)
  const eventList = events.map((e) => ({ id: e.id, name: e.name }))

  return (
    <div className="space-y-6">
      <Header
        strings={strings}
        action={
          seating ? (
            <EventPicker events={eventList} selectedId={selectedId} strings={scopeStrings} />
          ) : null
        }
      />
      {seating ? (
        <SeatingPlanner data={seating} strings={strings} />
      ) : (
        <EmptyState
          title={strings.event_not_found_title}
          description={strings.event_not_found_description}
        />
      )}
    </div>
  )
}

function Header({ strings, action }: { strings: DashboardSeatingStrings; action?: ReactNode }) {
  return (
    <header className="border-b border-black/[0.06] pb-6">
      <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">
        {strings.header_title}
      </h1>
      {/* Event picker rides the right end of the subtitle row (which sits below
          the overlaid account icons, so it needs no right clearance). The
          subtitle flexes/shrinks so the picker stays on the same line. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-[#1A1A1A]/65 sm:text-base">{strings.header_description}</p>
        {action}
      </div>
    </header>
  )
}
