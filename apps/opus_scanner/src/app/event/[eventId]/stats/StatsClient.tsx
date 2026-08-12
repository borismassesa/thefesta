'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, ShieldCheck } from 'lucide-react'
import { readSession } from '@/lib/session'
import { listRoster, type RosterEntry } from '@/lib/db'
import { checkinChannelName, createRealtimeClient, type CheckinBroadcastPayload } from '@/lib/realtimeClient'

type RosterRow = RosterEntry & { key: string; eventId: string }

export default function StatsClient({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [activity, setActivity] = useState<CheckinBroadcastPayload[]>([])

  const refresh = useCallback(() => {
    listRoster(eventId).then(setRoster)
  }, [eventId])

  useEffect(() => {
    const session = readSession(eventId)
    if (!session || !session.attendantName) {
      router.replace(`/event/${eventId}`)
      return
    }
    refresh()
  }, [eventId, refresh, router])

  useEffect(() => {
    let client: ReturnType<typeof createRealtimeClient>
    try {
      client = createRealtimeClient()
    } catch {
      return
    }
    const channel = client
      .channel(checkinChannelName(eventId))
      .on('broadcast', { event: 'scan' }, ({ payload }) => {
        setActivity((prev) => [payload as CheckinBroadcastPayload, ...prev].slice(0, 10))
        refresh()
      })
      .subscribe()
    return () => {
      client.removeChannel(channel)
    }
  }, [eventId, refresh])

  const admitted = roster.filter((r) => r.checkedInAt).length
  const remaining = roster.length - admitted
  const capacityPct = roster.length > 0 ? Math.round((admitted / roster.length) * 100) : 0
  const vipTotal = roster.filter((r) => r.isVip).length
  const vipAdmitted = roster.filter((r) => r.isVip && r.checkedInAt).length
  const generalTotal = roster.length - vipTotal
  const generalAdmitted = admitted - vipAdmitted

  // Circle progress ring geometry (same technique as the design prototype).
  const dash = `${capacityPct}, 100`

  const doorsByLastSeen = Object.values(
    activity.reduce<Record<string, CheckinBroadcastPayload>>((acc, a) => {
      if (!acc[a.doorLabel] || a.at > acc[a.doorLabel].at) acc[a.doorLabel] = a
      return acc
    }, {}),
  ).sort((a, b) => (b.at > a.at ? 1 : -1))

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-8">
      <div className="mb-10">
        <h2 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">Metrics &amp; Flow</h2>
        <p className="mt-1 text-xs tracking-wide text-[#1A1A1A] uppercase">Live check-in analysis</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-black/[0.06] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <span className="text-[10px] tracking-wide text-[#1A1A1A] uppercase">Admitted</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#1A1A1A]">{admitted}</span>
          </div>
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full bg-[#9fe870]" style={{ width: `${capacityPct}%` }} />
          </div>
        </div>

        <div className="rounded-xl border border-black/[0.06] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <span className="text-[10px] tracking-wide text-[#1A1A1A] uppercase">Remaining</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#1A1A1A]">{remaining}</span>
            <span className="text-[10px] tracking-wide text-[#1A1A1A] uppercase">not yet arrived</span>
          </div>
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full bg-gray-400" style={{ width: `${100 - capacityPct}%` }} />
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-black/[0.06] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between">
            <span className="text-[10px] tracking-wide text-[#1A1A1A] uppercase">System</span>
            <ShieldCheck className="h-4 w-4 text-[#8e57b3]" />
          </div>
          <div className="mt-4 flex items-center gap-2.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#9fe870]" />
            <span className="text-[11px] tracking-wide text-[#1A1A1A] uppercase">
              {doorsByLastSeen.length || 1} door{doorsByLastSeen.length === 1 ? '' : 's'} active
            </span>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col items-center rounded-xl border border-black/[0.06] bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:col-span-4">
          <div className="mb-6 flex w-full items-center justify-between">
            <h3 className="text-[10px] tracking-wide text-[#1A1A1A] uppercase">Capacity</h3>
          </div>
          <div className="relative flex items-center justify-center py-2">
            <svg className="h-40 w-40 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-black/[0.06]"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeDasharray="100, 100"
                strokeWidth="2"
              />
              <path
                className="text-[#9fe870]"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeDasharray={dash}
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-[#1A1A1A]">{capacityPct}%</span>
              <span className="text-[9px] tracking-wide text-[#1A1A1A] uppercase">Checked in</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-black/[0.06] bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:col-span-8">
          <h3 className="mb-8 text-[10px] tracking-wide text-[#1A1A1A] uppercase">Tier breakdown</h3>
          <div className="flex flex-col gap-8">
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs tracking-wide text-[#1A1A1A] uppercase">
                <span>General Admission</span>
                <span className="text-base font-semibold text-[#1A1A1A] normal-case">
                  {generalAdmitted} / {generalTotal}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className="h-full bg-[#8e57b3]"
                  style={{ width: `${generalTotal > 0 ? Math.round((generalAdmitted / generalTotal) * 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs tracking-wide text-[#B07F2C] uppercase">
                <span>VIP / Hospitality</span>
                <span className="text-base font-semibold text-[#1A1A1A] normal-case">
                  {vipAdmitted} / {vipTotal}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className="h-full bg-[#F5C77E]"
                  style={{ width: `${vipTotal > 0 ? Math.round((vipAdmitted / vipTotal) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-black/[0.06] bg-black/[0.015] px-6 py-4">
          <h3 className="text-[10px] tracking-wide text-[#1A1A1A] uppercase">Recent activity</h3>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9fe870]" />
            <span className="text-[9px] tracking-wide text-[#1A1A1A] uppercase">Live sync</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="opus-table w-full text-left">
            <thead>
              <tr className="border-b border-black/[0.05]">
                <th className="px-6 py-3 text-[9px] tracking-wide text-[#1A1A1A] uppercase">Guest</th>
                <th className="px-6 py-3 text-[9px] tracking-wide text-[#1A1A1A] uppercase">Door</th>
                <th className="px-6 py-3 text-right text-[9px] tracking-wide text-[#1A1A1A] uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {activity.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-[#1A1A1A]">
                    No activity yet
                  </td>
                </tr>
              ) : (
                activity.map((a, i) => (
                  <tr key={i} className="hover:bg-black/[0.015]">
                    <td className="px-6 py-3 font-medium text-[#1A1A1A]">{a.guestName}</td>
                    <td className="px-6 py-3 text-[10px] tracking-wide text-[#1A1A1A] uppercase">{a.doorLabel}</td>
                    <td className="px-6 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[9px] tracking-wide uppercase ${
                          a.status === 'duplicate'
                            ? 'border border-[#FCE9C2] bg-[#FCE9C2]/50 text-[#B07F2C]'
                            : 'border border-[#E8FBDB] bg-[#E8FBDB]/50 text-[#3f8b5c]'
                        }`}
                      >
                        {a.status === 'duplicate' ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {a.status === 'duplicate' ? 'Duplicate' : 'Admitted'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
