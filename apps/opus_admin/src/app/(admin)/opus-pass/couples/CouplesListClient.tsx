'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, Search, Store, Users } from 'lucide-react'
import type { CoupleAccountRow } from './queries'
import { toDateInputValue, type CoupleEditable } from './editable'
import { CoupleRowActions, DeleteDormantButton, NewCoupleButton } from './CoupleAccountControls'

const FILTERS = ['All', 'Active', 'Dormant', 'Onboarded', 'Has events', 'Paying', 'No sign-in'] as const
type Filter = (typeof FILTERS)[number]

const SORTS = {
  activity: { label: 'Last activity', compare: (a: CoupleAccountRow, b: CoupleAccountRow) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') },
  signup: { label: 'Newest signup', compare: (a: CoupleAccountRow, b: CoupleAccountRow) => b.signedUpAt.localeCompare(a.signedUpAt) },
  name: { label: 'Name', compare: (a: CoupleAccountRow, b: CoupleAccountRow) => a.coupleName.localeCompare(b.coupleName) },
  spend: { label: 'Lifetime spend', compare: (a: CoupleAccountRow, b: CoupleAccountRow) => b.lifetimeSpendTzs - a.lifetimeSpendTzs },
  guests: { label: 'Guest list size', compare: (a: CoupleAccountRow, b: CoupleAccountRow) => b.guestCount - a.guestCount },
} as const
type SortKey = keyof typeof SORTS

const STATUS_CLASS: Record<CoupleAccountRow['status'], string> = {
  paying: 'border-[#7E5896] bg-[#F0DFF6] text-[#5d3a78]',
  active: 'border-[#7ec24a] bg-[#9FE870]/25 text-[#3d6b1f]',
  dormant: 'border-gray-200 bg-gray-50 text-gray-500',
}

const STATUS_LABEL: Record<CoupleAccountRow['status'], string> = {
  paying: 'Paying',
  active: 'Active',
  dormant: 'Dormant',
}

function matchesFilter(couple: CoupleAccountRow, filter: Filter): boolean {
  switch (filter) {
    case 'Active':
      return couple.status !== 'dormant'
    case 'Dormant':
      return couple.status === 'dormant'
    case 'Onboarded':
      return couple.onboarded
    case 'Has events':
      return couple.eventCount > 0
    case 'Paying':
      return couple.status === 'paying'
    case 'No sign-in':
      return !couple.clerkLinked
    default:
      return true
  }
}

/** Two-digit year keeps each date on one line, so rows stay a single line tall
 *  across all 53 of them. The console shows full dates where there is room. */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const CSV_COLUMNS: { header: string; get: (c: CoupleAccountRow) => string | number | boolean | null }[] = [
  { header: 'Couple', get: (c) => c.coupleName },
  { header: 'Email', get: (c) => c.email },
  { header: 'Phone', get: (c) => c.phone },
  { header: 'City', get: (c) => c.city },
  { header: 'Status', get: (c) => STATUS_LABEL[c.status] },
  { header: 'Onboarded', get: (c) => c.onboarded },
  { header: 'Can sign in', get: (c) => c.clerkLinked },
  { header: 'Signed up', get: (c) => c.signedUpAt },
  { header: 'Wedding date', get: (c) => c.weddingDate },
  { header: 'Events', get: (c) => c.eventCount },
  { header: 'Guests', get: (c) => c.guestCount },
  { header: 'Invites', get: (c) => c.invitationCount },
  { header: 'RSVP attending', get: (c) => c.rsvpAttending },
  { header: 'Paid orders', get: (c) => c.paidOrderCount },
  { header: 'Lifetime spend TZS', get: (c) => c.lifetimeSpendTzs },
  { header: 'Pledges', get: (c) => c.pledgeCount },
  { header: 'Last activity', get: (c) => c.lastActivityAt },
  { header: 'Also a vendor', get: (c) => c.vendorStorefronts.map((v) => v.businessName).join('; ') },
]

/** Built from rows already in the browser, so there is no export endpoint to
 *  secure separately — staff can only export what the page let them read. */
function downloadCsv(rows: CoupleAccountRow[]): void {
  const lines = [
    CSV_COLUMNS.map((col) => csvCell(col.header)).join(','),
    ...rows.map((row) => CSV_COLUMNS.map((col) => csvCell(col.get(row))).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'opuspass-couple-accounts.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

/** The list row already carries every field the edit form needs, so opening it
 *  costs no extra round-trip. `profileWeddingDate` deliberately, not
 *  `weddingDate`: the latter falls back to an event's start date for display,
 *  and prefilling that would silently copy it onto the profile on save. */
function toEditable(couple: CoupleAccountRow): CoupleEditable {
  return {
    userId: couple.userId,
    coupleName: couple.coupleName,
    partner1Name: couple.partner1Name ?? '',
    partner2Name: couple.partner2Name ?? '',
    email: couple.email ?? '',
    phone: couple.phone ?? '',
    whatsappPhone: couple.whatsappPhone ?? '',
    city: couple.city ?? '',
    region: couple.region ?? '',
    weddingDate: toDateInputValue(couple.profileWeddingDate),
    dateUndecided: couple.dateUndecided,
    budgetRange: couple.budgetRange ?? '',
    guestCount: couple.expectedGuestCount === null ? '' : String(couple.expectedGuestCount),
    canSignIn: couple.clerkLinked,
  }
}

export default function CouplesListClient({
  couples,
  canWrite,
  canDelete,
}: {
  couples: CoupleAccountRow[]
  canWrite: boolean
  canDelete: boolean
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [sort, setSort] = useState<SortKey>('activity')

  const counts = useMemo(() => {
    const result = {} as Record<Filter, number>
    for (const f of FILTERS) result[f] = couples.filter((c) => matchesFilter(c, f)).length
    return result
  }, [couples])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return couples
      .filter((c) => matchesFilter(c, filter))
      .filter((c) => {
        if (!needle) return true
        return [c.coupleName, c.email, c.phone, c.city].some((field) => field?.toLowerCase().includes(needle))
      })
      .sort(SORTS[sort].compare)
  }, [couples, filter, query, sort])

  return (
    <div className="mt-6">
      {/* The chips carry the breakdown that used to sit in a row of stat
          tiles, so they lead — same numbers, but each one filters. */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === f
                ? 'border-[#7E5896] bg-[#7E5896] text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-[#C9A0DC] hover:text-[#7E5896]'
            }`}
          >
            {f} <span className={filter === f ? 'text-white/70' : 'text-gray-400'}>{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, phone or city"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7E5896] focus:outline-none"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-[#7E5896] focus:outline-none"
          aria-label="Sort couples"
        >
          {Object.entries(SORTS).map(([key, { label }]) => (
            <option key={key} value={key}>
              Sort: {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => downloadCsv(visible)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-[#C9A0DC] hover:text-[#7E5896]"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
        {canWrite ? <NewCoupleButton /> : null}
        {/* Only on the Dormant filter, where every visible row is a signup that
            never did anything. Acts on exactly what is on screen, search
            included, so the count in the label is the count that goes. */}
        {canDelete && filter === 'Dormant' ? (
          <DeleteDormantButton
            couples={visible.map((c) => ({
              userId: c.userId,
              coupleName: c.coupleName,
              email: c.email ?? '',
            }))}
          />
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-gray-300" />
          <h2 className="mt-3 text-sm font-semibold text-gray-900">No couples match</h2>
          <p className="mt-1 text-sm text-gray-500">Try a different filter or clear the search.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Couple</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Events</th>
                <th className="px-3 py-3 text-right">Guests</th>
                <th className="px-3 py-3 text-right">RSVP</th>
                <th className="px-3 py-3 text-right">Spend</th>
                <th className="whitespace-nowrap px-3 py-3">Wedding</th>
                <th className="whitespace-nowrap px-4 py-3">Last active</th>
                <th className="w-10 px-2 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((couple) => (
                <tr key={couple.userId} className="border-b border-gray-50 transition last:border-0 hover:bg-[#FBF8FD]">
                  {/* Capped and truncated: long addresses like
                      name+tag+tag@gmail.com otherwise stretch the table past
                      its container and clip the last column. */}
                  <td className="max-w-[240px] px-4 py-3">
                    <Link href={`/opus-pass/couples/${couple.userId}`} className="block">
                      <span className="block truncate font-semibold text-gray-900">{couple.coupleName}</span>
                      <span
                        className="mt-0.5 block truncate text-xs text-gray-500"
                        title={couple.email ?? undefined}
                      >
                        {couple.email ?? 'No email'}
                        {couple.city ? ` · ${couple.city}` : ''}
                        {couple.clerkLinked ? '' : ' · no sign-in'}
                      </span>
                    </Link>
                    {/* Same login, two workspaces. Shown rather than hidden so
                        staff know before they act on the account: deleting the
                        login would take the storefront with it. */}
                    {couple.vendorStorefronts.length > 0 ? (
                      <Link
                        href="/operations/vendors"
                        className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-[#9FE870] px-2 py-0.5 text-[11px] font-semibold text-[#14532D] transition hover:bg-[#8FD95F]"
                        title={`Also a vendor: ${couple.vendorStorefronts.map((v) => v.businessName).join(', ')}`}
                      >
                        <Store className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {couple.vendorStorefronts.length === 1
                            ? couple.vendorStorefronts[0].businessName
                            : `${couple.vendorStorefronts.length} storefronts`}
                        </span>
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[couple.status]}`}>
                      {STATUS_LABEL[couple.status]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-700">{couple.eventCount}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-700">{couple.guestCount}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-700">
                    {couple.rsvpAttending}
                    <span className="text-gray-400"> / {couple.invitationCount}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-700">
                    {couple.lifetimeSpendTzs > 0 ? couple.lifetimeSpendTzs.toLocaleString('en-US') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-600">{formatDate(couple.weddingDate)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(couple.lastActivityAt)}</td>
                  <td className="px-2 py-3">
                    <CoupleRowActions couple={toEditable(couple)} canWrite={canWrite} canDelete={canDelete} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
