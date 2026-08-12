'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { readSession, type ScannerSession } from '@/lib/session'
import { listRoster, markRosterCheckedInLocally, type RosterEntry } from '@/lib/db'
import { checkinChannelName, createRealtimeClient } from '@/lib/realtimeClient'

type RosterRow = RosterEntry & { key: string; eventId: string }
type Filter = 'all' | 'vip' | 'checked_in' | 'pending'

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function GuestsClient({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [sessionData, setSessionData] = useState<ScannerSession | null>(null)

  const refresh = useCallback(() => {
    listRoster(eventId).then(setRoster)
  }, [eventId])

  useEffect(() => {
    const session = readSession(eventId)
    if (!session || !session.attendantName) {
      router.replace(`/event/${eventId}`)
      return
    }
    setSessionData(session)
    refresh()
  }, [eventId, refresh, router])

  // Live updates from any door (this device's own scans, other doors, the
  // Scan tab) — without this, the ledger only reflects check-ins that
  // happened before this page loaded.
  useEffect(() => {
    let client: ReturnType<typeof createRealtimeClient>
    try {
      client = createRealtimeClient()
    } catch {
      return
    }
    const channel = client
      .channel(checkinChannelName(eventId))
      .on('broadcast', { event: 'scan' }, () => refresh())
      .subscribe()
    return () => {
      client.removeChannel(channel)
    }
  }, [eventId, refresh])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return roster
      .filter((r) => (q ? r.fullName.toLowerCase().includes(q) : true))
      .filter((r) => {
        if (filter === 'vip') return r.isVip
        if (filter === 'checked_in') return Boolean(r.checkedInAt)
        if (filter === 'pending') return !r.checkedInAt
        return true
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [roster, query, filter])

  const admitted = roster.filter((r) => r.checkedInAt).length
  const capacityPct = roster.length > 0 ? Math.round((admitted / roster.length) * 100) : 0

  async function admit(entry: RosterRow) {
    const session = sessionData
    if (!session || pendingId) return
    setPendingId(entry.key)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          accessToken: session.accessToken,
          doorLabel: session.doorLabel,
          attendantName: session.attendantName,
          qrToken: entry.qrToken,
          manualReason: 'Ledger',
        }),
      })
      const data = (await res.json()) as { status: string }
      // Same local-cache sync ScanClient does — the server write already
      // succeeded; this just keeps this device's cached roster (and
      // therefore this table) in step with it immediately.
      if (data.status === 'success' || data.status === 'duplicate') {
        await markRosterCheckedInLocally(eventId, entry.qrToken, new Date().toISOString())
      }
    } finally {
      setPendingId(null)
      refresh()
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-8">
      <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">Guest Ledger</h2>
          <p className="mt-1 text-xs tracking-wide text-[#1A1A1A] uppercase">Live access verification</p>
        </div>
        <div className="min-w-[280px] rounded-xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="mb-2.5 flex items-end justify-between">
            <div>
              <span className="text-[10px] tracking-wide text-[#1A1A1A] uppercase">Checked in</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold text-[#1A1A1A]">{admitted}</span>
                <span className="text-base text-[#1A1A1A]">/ {roster.length}</span>
              </div>
            </div>
            <span className="rounded-full border border-[#E8FBDB] bg-[#E8FBDB] px-3 py-1 text-[9px] tracking-wide text-[#3f8b5c] uppercase">
              {capacityPct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full bg-[#9fe870] transition-all duration-500" style={{ width: `${capacityPct}%` }} />
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="relative w-full md:w-[360px]">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-xl border border-black/[0.12] bg-white py-3 pr-4 pl-11 text-sm text-[#1A1A1A] outline-none transition-colors placeholder:text-gray-500 focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#C9A0DC]/30"
          />
        </div>
        <div className="flex w-full gap-2 overflow-x-auto md:w-auto">
          {(['all', 'vip', 'pending', 'checked_in'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-lg border px-4 py-2 text-[10px] font-medium tracking-wide uppercase transition-colors ${
                filter === f
                  ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                  : 'border-black/[0.12] bg-white text-[#1A1A1A] hover:border-black/[0.2]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'vip' ? 'VIP' : f === 'pending' ? 'Pending' : 'Checked in'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="opus-table w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-black/[0.06] bg-black/[0.015]">
                <th className="px-6 py-4 text-[10px] tracking-wide text-[#1A1A1A] uppercase">Guest</th>
                <th className="px-6 py-4 text-[10px] tracking-wide text-[#1A1A1A] uppercase">Party</th>
                <th className="px-6 py-4 text-[10px] tracking-wide text-[#1A1A1A] uppercase">Group</th>
                <th className="px-6 py-4 text-[10px] tracking-wide text-[#1A1A1A] uppercase">Status</th>
                <th className="px-6 py-4 text-right text-[10px] tracking-wide text-[#1A1A1A] uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-[#1A1A1A]">
                    {roster.length === 0 ? 'No guests cached yet.' : `No guests match this view.`}
                  </td>
                </tr>
              ) : (
                filtered.map((guest) => (
                  <tr key={guest.key} className={guest.checkedInAt ? 'bg-[#E8FBDB]/30' : undefined}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                            guest.isVip ? 'bg-[#FCE9C2] text-[#B07F2C]' : 'bg-[#F0DFF6] text-[#8e57b3]'
                          }`}
                        >
                          {initials(guest.fullName)}
                        </div>
                        <span className="text-sm font-medium text-[#1A1A1A]">{guest.fullName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[#1A1A1A]">{guest.partySize}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {guest.groupTag ? (
                          <span className="rounded border border-black/[0.08] bg-black/[0.03] px-2 py-1 text-[9px] tracking-wide text-[#1A1A1A] uppercase">
                            {guest.groupTag}
                          </span>
                        ) : (
                          <span className="text-xs text-[#1A1A1A]/35">—</span>
                        )}
                        {guest.isVip ? (
                          <span className="rounded border border-[#FCE9C2] bg-[#FCE9C2] px-2 py-1 text-[9px] font-bold tracking-wide text-[#B07F2C] uppercase">
                            VIP
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {guest.checkedInAt ? (
                        <div className="flex items-center gap-2 text-[#3f8b5c]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#9fe870]" />
                          <span className="text-[10px] tracking-wide uppercase">Verified</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[#1A1A1A]">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          <span className="text-[10px] tracking-wide uppercase">Pending</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!guest.checkedInAt ? (
                        <button
                          type="button"
                          disabled={pendingId === guest.key}
                          onClick={() => admit(guest)}
                          className="rounded-lg border border-black/[0.12] px-4 py-2 text-[10px] tracking-wide text-[#1A1A1A] uppercase transition-all hover:border-black/[0.2] hover:bg-black/[0.04] disabled:opacity-40"
                        >
                          {pendingId === guest.key ? 'Admitting…' : 'Admit'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-black/[0.06] bg-black/[0.015] px-6 py-3.5">
          <span className="text-[10px] tracking-wide text-[#1A1A1A] uppercase">
            Showing {filtered.length} of {roster.length}
          </span>
        </div>
      </div>
    </div>
  )
}
