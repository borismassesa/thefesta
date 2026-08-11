import Link from 'next/link'
import { hasPermission, requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { formatRelativeTime } from '../_shared/relativeTime'
import BookingsPageHeading from './BookingsPageHeading'
import StatusCell from './StatusCell'
import type { InquiryStatus } from './actions'

export const dynamic = 'force-dynamic'

// Booking inquiry pipeline. Couples submit inquiries to vendors from the
// public site; this is the operator's queue for working them from first
// contact through to an accepted proposal.
//
// Permission model: bookings.read can view; bookings.write unlocks the
// inline status dropdown (StatusCell).

type InquiryRow = {
  id: string
  name: string
  email: string
  phone: string | null
  vendor_name: string | null
  vendor_slug: string | null
  event_type: string
  event_date: string | null
  guest_count: number | null
  budget: string | null
  location: string | null
  status: InquiryStatus | null
  proposal_invoice_amount: number | null
  created_at: string | null
}

const FILTERS = ['all', 'pending', 'responded', 'accepted', 'declined', 'closed'] as const
type Filter = (typeof FILTERS)[number]

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  pending: 'Pending',
  responded: 'Responded',
  accepted: 'Accepted',
  declined: 'Declined',
  closed: 'Closed',
}

function parseFilter(raw: string | undefined): Filter {
  return raw && (FILTERS as readonly string[]).includes(raw) ? (raw as Filter) : 'all'
}

function formatEventDate(iso: string | null): string {
  if (!iso) return 'Date TBD'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatValue(row: InquiryRow): string {
  if (row.proposal_invoice_amount && row.proposal_invoice_amount > 0) {
    return `TZS ${row.proposal_invoice_amount.toLocaleString()}`
  }
  return row.budget?.trim() || '—'
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requirePermission('bookings.read')
  const canEdit = await hasPermission('bookings.write')
  const filter = parseFilter((await searchParams).status)

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('inquiries')
    .select(
      'id, name, email, phone, vendor_name, vendor_slug, event_type, event_date, guest_count, budget, location, status, proposal_invoice_amount, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error

  const all = (data ?? []) as InquiryRow[]

  const counts = all.reduce<Record<Filter, number>>(
    (acc, r) => {
      acc.all += 1
      const s = r.status ?? 'pending'
      if (s in acc) acc[s as Filter] += 1
      return acc
    },
    { all: 0, pending: 0, responded: 0, accepted: 0, declined: 0, closed: 0 },
  )

  const rows = filter === 'all' ? all : all.filter((r) => (r.status ?? 'pending') === filter)

  const pending = counts.pending
  const subtitle = `${counts.all} total · ${pending} awaiting response`

  return (
    <div className="pb-12">
      <BookingsPageHeading title="Bookings" subtitle={subtitle} />
      <div className="mx-auto max-w-[1200px] px-8 pt-8">
        <nav className="mb-5 flex flex-wrap items-center gap-2" aria-label="Filter by status">
          {FILTERS.map((f) => {
            const active = f === filter
            return (
              <Link
                key={f}
                href={f === 'all' ? '/operations/bookings' : `/operations/bookings?status=${f}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {FILTER_LABEL[f]}
                <span className={active ? 'text-white/70' : 'text-gray-400'}>{counts[f]}</span>
              </Link>
            )
          })}
        </nav>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          {rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-gray-500">
              {filter === 'all'
                ? 'No booking inquiries yet. They land here when couples reach out to vendors from the public site.'
                : `No ${FILTER_LABEL[filter].toLowerCase()} inquiries.`}
            </p>
          ) : (
            <table className="opus-table w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Couple</th>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Event</th>
                  <th className="px-5 py-3">Value</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900">{row.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {row.email}
                        {row.phone ? ` · ${row.phone}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-700">
                      {row.vendor_name?.trim() || row.vendor_slug || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-xs text-gray-700">{row.event_type}</p>
                      <p className="text-[11px] text-gray-500">
                        {formatEventDate(row.event_date)}
                        {row.guest_count ? ` · ${row.guest_count} guests` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-xs tabular-nums text-gray-700">
                      {formatValue(row)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusCell
                        inquiryId={row.id}
                        status={row.status ?? 'pending'}
                        canEdit={canEdit}
                      />
                    </td>
                    <td className="px-5 py-3 text-xs tabular-nums text-gray-500">
                      {row.created_at ? formatRelativeTime(row.created_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
