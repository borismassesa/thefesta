'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, QrCode, ScrollText } from 'lucide-react'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderBadgeSlot } from '@/components/HeaderPortals'
import { cn } from '@/lib/utils'
import { eventLifecycle, LIFECYCLE_LABEL, LIFECYCLE_TONE } from '@/lib/checkin-event-status'
import CheckinEventClient, { type CheckinBaseline } from './CheckinEventClient'
import CheckinReportClient, { type CheckinReport } from './CheckinReportClient'
import CheckinAuditClient, { type AuditLedgerRow, type AuditSnapshotRow } from './CheckinAuditClient'
import type { AttendantAssignment } from '../actions'

type ConsoleTab = 'checkin' | 'report' | 'audit'

const TABS: { key: ConsoleTab; label: string; Icon: typeof QrCode }[] = [
  { key: 'checkin', label: 'Door staff', Icon: QrCode },
  { key: 'report', label: 'Report', Icon: FileText },
  // Staff-only raw ledger. Sits beside the other two because it is a third
  // view of the same door, for a third audience.
  { key: 'audit', label: 'Audit', Icon: ScrollText },
]

function formatEventDate(iso: string | null) {
  if (!iso) return 'No date set'
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export default function EventConsoleClient({
  eventId,
  baseline,
  report,
  initialAttendants,
  initialTab,
  ledger,
  snapshots,
}: {
  eventId: string
  baseline: CheckinBaseline
  report: CheckinReport
  initialAttendants: AttendantAssignment[]
  initialTab: ConsoleTab
  ledger: AuditLedgerRow[]
  snapshots: AuditSnapshotRow[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<ConsoleTab>(initialTab)

  // Per-render snapshot — this is a client-only route, so there is no
  // SSR/hydration split for the lifecycle badge to desync against.
  // eslint-disable-next-line react-hooks/purity -- lifecycle is time-relative by definition
  const nowMs = Date.now()
  const lifecycle = eventLifecycle(baseline.event?.startsAt ?? null, baseline.event?.endsAt ?? null, nowMs)
  const venue = [baseline.event?.venueName, baseline.event?.city].filter(Boolean).join(', ')

  // The event identity lives in the global header rather than being echoed in
  // the page body. No `back` link: this console is reachable from the sidebar
  // and the back arrow would displace the event name it exists to introduce.
  useSetPageHeading({
    title: baseline.event?.name ?? 'Event',
    subtitle: [
      baseline.event?.eventType?.replace(/_/g, ' '),
      formatEventDate(baseline.event?.startsAt ?? null),
      venue || null,
    ]
      .filter(Boolean)
      .join(' · '),
  })

  function selectTab(next: ConsoleTab) {
    setTab(next)
    // Keep the URL in sync so refresh/share/back preserves which tab was open.
    router.replace(next === 'checkin' ? `/operations/checkin/${eventId}` : `/operations/checkin/${eventId}?tab=${next}`, {
      scroll: false,
    })
  }

  return (
    // Horizontal padding comes from operations/layout.tsx — adding p-6 here
    // stacked on top of it, pushing the content 24px in and down from the page
    // header. The negative top margin trims that layout's lg:py-10 to the 24px
    // the events list and the other OpusPass consoles sit at. (The admin shell
    // is desktop-only, so only the lg step matters.)
    <div className="space-y-5 lg:-mt-4">
      {/* Lifecycle pill rides next to the event name in the global header. */}
      <HeaderBadgeSlot>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            LIFECYCLE_TONE[lifecycle],
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              lifecycle === 'live' ? 'animate-pulse bg-[#3d6b1f]' : 'bg-current opacity-50',
            )}
          />
          {LIFECYCLE_LABEL[lifecycle]}
        </span>
      </HeaderBadgeSlot>

      {/* Underline tabs rather than a segmented control: this console is
          expected to grow (devices, audit), which a pill group stops scaling
          for well past three items. */}
      <div className="flex items-center gap-6 border-b border-gray-200 print:hidden">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-semibold transition-colors',
              tab === key
                ? 'border-[#7E5896] text-[#7E5896]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'checkin' ? (
        <CheckinEventClient eventId={eventId} baseline={baseline} initialAttendants={initialAttendants} />
      ) : tab === 'audit' ? (
        <CheckinAuditClient ledger={ledger} snapshots={snapshots} />
      ) : (
        <CheckinReportClient baseline={baseline} report={report} attendants={initialAttendants} />
      )}
    </div>
  )
}
