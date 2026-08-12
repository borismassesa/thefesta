import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clock,
  HandHeart,
  Search,
  Users,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { getEligibleCouples, type EligibleCouple } from './queries'
import PledgesHeading from './PledgesHeading'

export const dynamic = 'force-dynamic'

const TIER_LABEL: Record<EligibleCouple['tier'], string> = {
  elegant: 'Elegant',
  signature: 'Signature',
}

const TIER_CLASS: Record<EligibleCouple['tier'], string> = {
  elegant: 'border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]',
  signature: 'border-amber-200 bg-amber-50 text-amber-800',
}

type CampaignFilter = 'all' | 'outstanding' | 'settled' | 'empty'

const FILTER_TABS: { key: CampaignFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'settled', label: 'Fully collected' },
  { key: 'empty', label: 'Not started' },
]

function matchesFilter(couple: EligibleCouple, filter: CampaignFilter): boolean {
  switch (filter) {
    case 'outstanding':
      return couple.outstandingCount > 0
    case 'settled':
      return couple.pledgeCount > 0 && couple.outstandingCount === 0
    case 'empty':
      return couple.pledgeCount === 0
    default:
      return true
  }
}

function formatTzs(value: number): string {
  return `TZS ${value.toLocaleString('en-US')}`
}

function compactTzs(value: number): string {
  if (value >= 1_000_000) return `TZS ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `TZS ${(value / 1_000).toFixed(0)}K`
  return formatTzs(value)
}

function formatDate(iso: string | null): string {
  if (!iso) return 'No date set'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'No date set'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Kpi({
  label,
  value,
  icon,
  href,
  active,
}: {
  label: string
  value: string
  icon: ReactNode
  href?: string
  active?: boolean
}) {
  const className = cn(
    'block rounded-2xl border bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] transition-colors',
    active ? 'border-[#C9A0DC] ring-1 ring-[#C9A0DC]' : 'border-gray-100',
    href && 'hover:border-[#C9A0DC]',
  )
  const inner = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        <span className="text-[#7E5896]">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
    </>
  )
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  )
}

function Detail({ icon, label, value, meta }: { icon: ReactNode; label: string; value: string; meta?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <span className="text-[#7E5896]">{icon}</span>
        {label}
      </div>
      <p className="mt-2 break-words text-sm font-semibold text-gray-900">{value}</p>
      {meta && <p className="mt-1 break-words text-xs text-gray-500">{meta}</p>}
    </div>
  )
}

/** Received against pledged. Gives the row an at-a-glance sense of how far a
 *  campaign has actually got, which three bare numbers never did. */
function CollectionBar({ received, pledged }: { received: number; pledged: number }) {
  const pct = pledged > 0 ? Math.min(100, Math.round((received / pledged) * 100)) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Collected</p>
        <p className="text-xs font-semibold tabular-nums text-gray-500">
          {pct}% of {formatTzs(pledged)}
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CampaignCard({ couple }: { couple: EligibleCouple }) {
  return (
    <details className="group rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-gray-900">{couple.coupleName}</h2>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${TIER_CLASS[couple.tier]}`}
            >
              {TIER_LABEL[couple.tier]}
            </span>
            {couple.outstandingCount > 0 ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {couple.outstandingCount} outstanding
              </span>
            ) : couple.pledgeCount > 0 ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Fully collected
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
                Not started
              </span>
            )}
          </div>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-gray-500">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            {formatDate(couple.eventDateLabel)}
            <span className="text-gray-300">·</span>
            {couple.pledgeCount} {couple.pledgeCount === 1 ? 'pledge' : 'pledges'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Received</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700">{formatTzs(couple.totalReceived)}</p>
            <p className="text-xs tabular-nums text-gray-400">of {formatTzs(couple.totalPledged)}</p>
          </div>
          <span aria-hidden className="h-10 w-px shrink-0 bg-gray-200" />
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors group-hover:border-[#C9A0DC] group-hover:text-[#7E5896] group-open:bg-[#F0DFF6] group-open:text-[#7E5896]"
          >
            <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" />
          </span>
        </div>
      </summary>

      <div className="space-y-4 px-5 pb-5">
        <CollectionBar received={couple.totalReceived} pledged={couple.totalPledged} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail
            icon={<HandHeart className="h-4 w-4" />}
            label="Pledges"
            value={String(couple.pledgeCount)}
            meta={`${couple.outstandingCount} still to collect`}
          />
          <Detail icon={<Wallet className="h-4 w-4" />} label="Pledged" value={formatTzs(couple.totalPledged)} />
          <Detail
            icon={<Wallet className="h-4 w-4" />}
            label="Received"
            value={formatTzs(couple.totalReceived)}
            meta={
              couple.totalPledged > couple.totalReceived
                ? `${formatTzs(couple.totalPledged - couple.totalReceived)} outstanding`
                : undefined
            }
          />
          <Detail
            icon={<Clock className="h-4 w-4" />}
            label="Last activity"
            value={couple.lastActivityAt ? formatDate(couple.lastActivityAt) : 'No activity yet'}
          />
        </div>
        <Link
          href={`/opus-pass/pledges/${couple.userId}`}
          className="inline-flex items-center gap-2 rounded-xl bg-[#7E5896] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6c4884]"
        >
          Open pledge console
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </details>
  )
}

function filterHref(filter: CampaignFilter, q?: string): string {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('filter', filter)
  if (q) params.set('q', q)
  const qs = params.toString()
  return qs ? `/opus-pass/pledges?${qs}` : '/opus-pass/pledges'
}

export default async function PledgeConciergePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('opuspass.pledges.read'))) redirect('/')

  const sp = await searchParams
  const filter: CampaignFilter = (['outstanding', 'settled', 'empty', 'all'] as const).includes(
    sp.filter as CampaignFilter,
  )
    ? (sp.filter as CampaignFilter)
    : 'all'
  const q = (sp.q ?? '').trim()

  const couples = await getEligibleCouples()

  // Totals stay across the whole eligible set, not the filtered view — the
  // KPIs are the campaign's headline, and they double as filter entry points.
  const totalPledged = couples.reduce((sum, c) => sum + c.totalPledged, 0)
  const totalReceived = couples.reduce((sum, c) => sum + c.totalReceived, 0)
  const totalOutstanding = couples.reduce((sum, c) => sum + c.outstandingCount, 0)

  const needle = q.toLowerCase()
  const visible = couples
    .filter((c) => matchesFilter(c, filter))
    .filter((c) => !needle || c.coupleName.toLowerCase().includes(needle))

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PledgesHeading />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Couples"
          value={String(couples.length)}
          icon={<Users className="h-4 w-4" />}
          href={filterHref('all', q)}
          active={filter === 'all'}
        />
        <Kpi label="Pledged" value={compactTzs(totalPledged)} icon={<Wallet className="h-4 w-4" />} />
        <Kpi label="Received" value={compactTzs(totalReceived)} icon={<Wallet className="h-4 w-4" />} />
        <Kpi
          label="Outstanding pledges"
          value={String(totalOutstanding)}
          icon={<HandHeart className="h-4 w-4" />}
          href={filterHref('outstanding', q)}
          active={filter === 'outstanding'}
        />
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={filterHref(tab.key, q)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                filter === tab.key
                  ? 'bg-[#7E5896] text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <form method="get" action="/opus-pass/pledges" className="flex items-center gap-2">
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search couple name…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6] sm:w-72"
            />
          </div>
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="submit"
            className="rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6c4884]"
          >
            Search
          </button>
        </form>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <HandHeart className="mx-auto h-8 w-8 text-gray-300" />
          <h2 className="mt-3 text-sm font-semibold text-gray-900">
            {q || filter !== 'all' ? 'No campaigns match these filters' : 'No eligible couples yet'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {q || filter !== 'all' ? (
              <Link href="/opus-pass/pledges" className="text-[#7E5896] underline">
                Clear filters
              </Link>
            ) : (
              'Couples with a paid Elegant or Signature order will show up here.'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((couple) => (
            <CampaignCard key={couple.userId} couple={couple} />
          ))}
        </div>
      )}
    </div>
  )
}
