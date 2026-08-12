import {
  getGuestsWithInvitations,
  getEvents,
  getLastSendByGuest,
  getRsvpQuestions,
  getRsvpEventSummaries,
  getRsvpAnswerSummaries,
} from '@/lib/dashboard/queries'
import { loadDashboardHero } from '@/lib/cms/dashboard-hero'
import { loadDashboardCopy } from '@/lib/cms/dashboard-copy'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { resolveEventScope, ALL_EVENTS } from '@/lib/dashboard/event-scope'
import { EventChooser } from '@/components/dashboard/EventScope'
import RsvpsClient from './RsvpsClient'

export const dynamic = 'force-dynamic'

export default async function RsvpsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const { event: eventParam } = await searchParams
  const locale = await getLocale()

  // Multi-event couples choose a scope up front (a single event, or the
  // combined view); the tracker filter then starts on that choice.
  const [events, scopeStrings] = await Promise.all([
    getEvents(),
    loadUiStrings('dashboard-event-scope', locale),
  ])
  const scope = await resolveEventScope(events, eventParam, { allowAll: true })
  if (scope.needsChooser) {
    return (
      <div className="space-y-6">
        <EventChooser events={events} strings={scopeStrings} allowAll />
      </div>
    )
  }

  const [guests, lastSend, questions, summaries, answerSummaries, hero, copy] =
    await Promise.all([
      getGuestsWithInvitations(),
      getLastSendByGuest(),
      getRsvpQuestions(),
      getRsvpEventSummaries(),
      getRsvpAnswerSummaries(),
      loadDashboardHero('rsvps', locale),
      loadDashboardCopy('rsvps', locale),
    ])
  return (
    <RsvpsClient
      guests={guests}
      events={events}
      eventFilter={scope.isAll ? ALL_EVENTS : (scope.selected?.id ?? ALL_EVENTS)}
      scopeStrings={scopeStrings}
      lastSend={lastSend}
      hero={hero}
      copy={copy}
      questions={questions}
      summaries={summaries}
      answerSummaries={answerSummaries}
    />
  )
}
