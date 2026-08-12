'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { DashboardHero } from '@/components/dashboard/DashboardHero'
import { Tabs } from '@/components/dashboard/controls'
import { EventPicker } from '@/components/dashboard/EventScope'
import { ALL_EVENTS } from '@/lib/dashboard/event-scope-constants'
import RsvpSetupPanel from './RsvpSetupPanel'
import RsvpTracker from './RsvpTracker'
import type { DashboardHeroContent } from '@/lib/cms/dashboard-hero'
import type { RsvpsDashboardCopy } from '@/lib/cms/dashboard-copy'
import type { DashboardEventScopeStrings } from '@/lib/cms/ui-strings-fallback'
import type { RsvpEventSummary, RsvpAnswerSummary } from '@/lib/dashboard/queries'
import {
  RSVP_STATUS_LABELS,
  type GuestWithInvitations,
  type LastSend,
  type RsvpQuestion,
  type WeddingEvent,
} from '@/lib/dashboard/types'

type Tab = 'setup' | 'responses'

/** CSV-safe cell: quote, escape quotes, and neutralize spreadsheet formulas. */
function csvCell(value: string | number | null): string {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export default function RsvpsClient({
  guests,
  events,
  eventFilter,
  scopeStrings,
  lastSend,
  hero,
  copy,
  questions,
  summaries,
  answerSummaries,
}: {
  guests: GuestWithInvitations[]
  events: WeddingEvent[]
  /** Event id chosen on the event chooser, or 'all' for the combined view. */
  eventFilter: string
  scopeStrings: DashboardEventScopeStrings
  lastSend: Record<string, LastSend>
  hero: DashboardHeroContent
  copy: RsvpsDashboardCopy
  questions: RsvpQuestion[]
  summaries: RsvpEventSummary[]
  answerSummaries: Record<string, RsvpAnswerSummary>
}) {
  const [tab, setTab] = useState<Tab>('setup')

  // Setup & questions is per-event config — there's no sensible "all events"
  // merged view for it (each event has its own toggle + questions), so it
  // always resolves to one real event, falling back to the first when the
  // couple's overall scope is the combined "all" view. Kept as local state
  // (not routed through `?event=`/EventSwitcher like the Responses tab)
  // because every event's questions/summaries are already loaded client-side
  // here — switching which card shows doesn't need a server round-trip, and
  // relying on one made switching feel unreliable.
  const [setupEventId, setSetupEventId] = useState(
    () => eventFilter !== ALL_EVENTS ? eventFilter : (events[0]?.id ?? ''),
  )
  // Re-derive during render (not an effect — see react-hooks/set-state-in-effect)
  // when the couple's overall scope changes, e.g. switching events on the
  // Responses tab, then coming back to Setup & questions.
  const [syncedFilter, setSyncedFilter] = useState(eventFilter)
  if (eventFilter !== syncedFilter) {
    setSyncedFilter(eventFilter)
    if (eventFilter !== ALL_EVENTS) setSetupEventId(eventFilter)
  }

  const hasResponses = useMemo(
    () => guests.some((g) => g.invitations.length > 0),
    [guests],
  )

  function downloadReport() {
    const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? 'Event'
    const header = ['Guest', 'Group', 'Event', 'Status', 'Party size', 'Meal', 'Dietary notes', 'Message', 'Review']
    const lines: string[] = []
    for (const g of guests) {
      if (g.invitations.length === 0) continue
      const needsReview = g.review_status === 'unconfirmed'
      for (const inv of g.invitations) {
        // Match the on-screen tracker: when scoped to one event, only that
        // event's rows go in the report.
        if (eventFilter !== 'all' && inv.event_id !== eventFilter) continue
        lines.push(
          [
            g.full_name,
            g.group_tag,
            eventName(inv.event_id),
            RSVP_STATUS_LABELS[inv.rsvp_status],
            inv.rsvp_status === 'attending' ? inv.party_size : '',
            inv.meal_choice,
            inv.dietary_notes,
            inv.guest_message,
            needsReview ? 'Needs review' : '',
          ]
            .map(csvCell)
            .join(','),
        )
      }
    }
    const csv = [header.map(csvCell).join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rsvps.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <DashboardHero content={hero} divider={false} />

      <div>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'setup', label: 'Setup & questions' },
            { id: 'responses', label: 'Responses' },
          ]}
          trailing={
            <div className="flex flex-wrap items-center gap-2">
              {/* Responses is URL-scoped (?event=) with an all-events view;
                  Setup is per-event local state, so it drives setupEventId
                  directly via onSelect instead of navigating. */}
              {tab === 'responses' ? (
                <EventPicker events={events} selectedId={eventFilter} strings={scopeStrings} allowAll />
              ) : (
                <EventPicker
                  events={events}
                  selectedId={setupEventId}
                  strings={scopeStrings}
                  onSelect={setSetupEventId}
                />
              )}
              {hasResponses ? (
                <button data-opus-button="primary" data-opus-button-size="small"
                  type="button"
                  onClick={downloadReport}
                  className="inline-flex items-center gap-2 rounded-full bg-black/[0.05] px-4 py-2 text-xs font-semibold text-[#1A1A1A] hover:bg-black/[0.08]"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              ) : null}
              <Link
                href="/my/dashboard/rsvps/setup"
                className="inline-flex items-center rounded-full bg-[#C9A0DC] px-4 py-2 text-xs font-semibold text-[#1A1A1A] hover:bg-[#b97fd0]"
              >
                Guided setup
              </Link>
            </div>
          }
        />
        {tab === 'setup' ? (
          <RsvpSetupPanel
            events={events}
            selectedEventId={setupEventId}
            questions={questions}
            summaries={summaries}
            answerSummaries={answerSummaries}
          />
        ) : (
          <RsvpTracker
            guests={guests}
            events={events}
            eventFilter={eventFilter}
            lastSend={lastSend}
            copy={copy}
          />
        )}
      </div>
    </div>
  )
}
