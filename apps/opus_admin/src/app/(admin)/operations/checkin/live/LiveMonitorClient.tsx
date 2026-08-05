'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DoorOpen, MoonStar, QrCode, Radio, UserCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import {
  checkinChannelName,
  createCheckinRealtimeClient,
  type CheckinBroadcastPayload,
} from '@/lib/checkin-realtime'
import CheckinNavTabs from '../CheckinNavTabs'

export interface LiveEvent {
  id: string
  name: string
  eventType: string
  venue: string | null
  coupleName: string
  expected: number
  checkedIn: number
  staffOnDuty: number
  doorsStaffed: number
  lastArrivalAt: string | null
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Turnout is good news here, so the ramp is one hue rather than a severity
 *  scale — a full room at a wedding is not a warning. */
function barWidth(checkedIn: number, expected: number) {
  return expected > 0 ? Math.min(100, Math.round((checkedIn / expected) * 100)) : 0
}

function Kpi({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-medium text-gray-500">{label}</div>
        <span className="inline-flex h-7 w-7 items-center justify-center text-gray-400">{icon}</span>
      </div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-tight text-gray-900">{value}</div>
      {hint ? <div className="mt-2 text-[11px] text-gray-400">{hint}</div> : null}
    </div>
  )
}

export default function LiveMonitorClient({ events }: { events: LiveEvent[] }) {
  useSetPageHeading({
    title: 'Live Monitor',
    subtitle: 'Every event with its doors open right now',
  })

  // Live counts keyed by event, seeded from the server snapshot. One channel
  // per running event — the same feed the single-event console listens to, so
  // the two never disagree.
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(events.map((e) => [e.id, e.checkedIn])),
  )
  const [lastAt, setLastAt] = useState<Record<string, string>>(() =>
    Object.fromEntries(events.filter((e) => e.lastArrivalAt).map((e) => [e.id, e.lastArrivalAt!])),
  )
  const [connected, setConnected] = useState(false)

  // Depends on the id list, not the array identity: a re-render with the same
  // events must not tear down and re-open every channel.
  const eventIdKey = events.map((e) => e.id).join(',')
  useEffect(() => {
    if (!eventIdKey) return
    let client: ReturnType<typeof createCheckinRealtimeClient>
    try {
      client = createCheckinRealtimeClient()
    } catch {
      return
    }
    const ids = eventIdKey.split(',')
    const channels = ids.map((id) =>
      client
        .channel(checkinChannelName(id))
        .on('broadcast', { event: 'scan' }, ({ payload }) => {
          const p = payload as CheckinBroadcastPayload
          if (p.status !== 'success') return
          setCounts((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
          setLastAt((prev) => ({ ...prev, [id]: p.at }))
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setConnected(true)
        }),
    )
    return () => {
      for (const ch of channels) client.removeChannel(ch)
    }
  }, [eventIdKey])

  const totalExpected = events.reduce((sum, e) => sum + e.expected, 0)
  const totalIn = events.reduce((sum, e) => sum + (counts[e.id] ?? e.checkedIn), 0)
  const totalStaff = events.reduce((sum, e) => sum + e.staffOnDuty, 0)
  const unstaffed = events.filter((e) => e.staffOnDuty === 0).length

  return (
    <div className="space-y-5 lg:-mt-4">
      <CheckinNavTabs />

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
          <span className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#F0DFF6] text-[#7E5896]">
            <MoonStar className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-gray-700">No events are running right now</p>
          <p className="max-w-[42ch] text-xs leading-relaxed text-gray-400">
            An event appears here from a few hours before its start time until its doors close, with arrivals updating
            as guests scan.
          </p>
          <Link
            href="/operations/checkin"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80]"
          >
            <QrCode className="h-3.5 w-3.5" /> Browse all events
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label="Events running"
              value={String(events.length)}
              hint={connected ? 'live · updates as guests scan' : 'showing last known counts'}
              icon={<Radio className="h-4 w-4" />}
            />
            <Kpi label="Guests in" value={String(totalIn)} hint={`of ${totalExpected} expected`} icon={<Users className="h-4 w-4" />} />
            <Kpi label="Staff on duty" value={String(totalStaff)} hint="active codes across all doors" icon={<UserCheck className="h-4 w-4" />} />
            <Kpi
              label="Unstaffed"
              value={String(unstaffed)}
              hint={unstaffed > 0 ? 'events with nobody able to scan' : 'every running event is covered'}
              icon={<DoorOpen className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {events.map((e) => {
              const checkedIn = counts[e.id] ?? e.checkedIn
              const pct = barWidth(checkedIn, e.expected)
              const last = lastAt[e.id]
              return (
                <div
                  key={e.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] transition-colors hover:border-[#C9A0DC]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#7ec24a] bg-[#9FE870]/25 px-1.5 py-0.5 text-[10px] font-bold text-[#2f5518] uppercase">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-[#3d6b1f]" />
                          Live
                        </span>
                        <h2 className="truncate text-sm font-semibold text-gray-900">{e.name}</h2>
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-500 capitalize">
                        {e.eventType.replace(/_/g, ' ')}
                        {e.venue ? <span className="normal-case"> · {e.venue}</span> : null}
                      </p>
                    </div>
                    <Link
                      href={`/operations/checkin/${e.id}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80]"
                    >
                      <QrCode className="h-3.5 w-3.5" /> Open
                    </Link>
                  </div>

                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[32px] leading-none font-semibold tracking-tight text-gray-900">{pct}%</span>
                    <span className="text-sm text-gray-500 tabular-nums">
                      {checkedIn} of {e.expected} in
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F0DFF6]">
                    <div className="h-full rounded-full bg-[#7E5896] transition-all" style={{ width: `${pct}%` }} />
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-3 text-xs">
                    <div>
                      <dt className="text-gray-400">Door staff</dt>
                      <dd
                        className={cn(
                          'mt-0.5 font-semibold tabular-nums',
                          e.staffOnDuty === 0 ? 'text-rose-600' : 'text-gray-800',
                        )}
                      >
                        {e.staffOnDuty === 0 ? 'None on duty' : e.staffOnDuty}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">Doors covered</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-gray-800">{e.doorsStaffed}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">Last scan</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-gray-800">
                        {last ? formatTime(last) : 'None yet'}
                      </dd>
                    </div>
                  </dl>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
