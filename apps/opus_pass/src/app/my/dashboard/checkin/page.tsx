import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/primitives'
import { Button } from '@/components/dashboard/controls'
import { getEvents } from '@/lib/dashboard/queries'
import { requireDashboardUser } from '@/lib/dashboard/auth'
import { resolveEventScope } from '@/lib/dashboard/event-scope'
import { EventChooser, EventPicker } from '@/components/dashboard/EventScope'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { buildCheckinReportModel } from '@/lib/checkin/report-model'
import OperationsReportClient from './OperationsReportClient'

/**
 * The Operations report, for the couple.
 *
 * Answers "what is happening right now?", so it is deliberately NOT the
 * keepsake: no cover, no thank-you, no storytelling. Most of this already
 * existed in opus_admin, which door staff and couples cannot reach — the
 * audience for a live door view includes the couple standing at it.
 *
 * Always rendered fresh. A cached arrivals count during a wedding is worse
 * than no count at all.
 */
export const dynamic = 'force-dynamic'

export default async function CheckinOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const { event: eventParam } = await searchParams
  const user = await requireDashboardUser('/my/dashboard/checkin')
  const locale = await getLocale()
  const scopeStrings = await loadUiStrings('dashboard-event-scope', locale)
  const events = await getEvents()

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          icon={<CalendarPlus className="h-7 w-7" />}
          title="No events yet"
          description="Create an event to track arrivals at the door."
          action={
            <Link href="/my/dashboard/events">
              <Button>
                <CalendarPlus className="h-4 w-4" /> Create an event
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  const scope = await resolveEventScope(events, eventParam)
  if (scope.needsChooser || !scope.selected) {
    return (
      <div className="space-y-6">
        <Header />
        <EventChooser events={events} strings={scopeStrings} />
      </div>
    )
  }

  // Ownership is already established by resolveEventScope working off
  // getEvents(), which is scoped to this user; the model re-scopes anyway.
  const model = await buildCheckinReportModel(user.id, scope.selected.id)

  return (
    <div className="space-y-6">
      <Header />
      <EventPicker events={events} selectedId={scope.selected.id} strings={scopeStrings} />
      {model ? (
        <OperationsReportClient model={model} locale={locale === 'sw' ? 'sw' : 'en'} />
      ) : (
        <EmptyState
          icon={<CalendarPlus className="h-7 w-7" />}
          title="Nothing to show yet"
          description="This event has no check-in activity."
        />
      )}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Door &amp; Check-in</h1>
      <p className="mt-1 text-sm text-gray-500">
        Live arrivals as your guests come through the door.
      </p>
    </div>
  )
}
