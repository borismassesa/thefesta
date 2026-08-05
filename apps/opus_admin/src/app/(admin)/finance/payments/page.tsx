import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Mail,
  Minus,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Send,
  Smartphone,
  Ticket,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { approveDigitalCardPayment, rejectDigitalCardPayment, adjustEntitlementCredits } from './actions'
import {
  getDigitalCardPayments,
  getDigitalCardPaymentSummary,
  getPaymentCategoryCounts,
  getEventCreditUsage,
  PAYMENTS_PAGE_SIZE,
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_CATEGORY_BADGE,
  type DigitalCardPayment,
  type DigitalCardPaymentStatus,
  type PaymentCategory,
  type PaymentFilter,
  type EventCreditUsage,
  type PoolUsage,
} from './queries'
import { formatTzs, compactTzs, formatDate, dateTimeParts } from '../_components/format'
import { Kpi, Detail } from '../_components/primitives'
import PaymentsHeading from './PaymentsHeading'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<DigitalCardPaymentStatus, string> = {
  pending: 'Pending',
  processing: 'Needs review',
  paid: 'Approved',
  failed: 'Rejected',
  expired: 'Expired',
  refunded: 'Refunded',
}

const STATUS_CLASS: Record<DigitalCardPaymentStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  processing: 'border-amber-200 bg-amber-50 text-amber-800',
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  expired: 'border-gray-200 bg-gray-50 text-gray-600',
  refunded: 'border-blue-200 bg-blue-50 text-blue-700',
}

function StatusBadge({ status }: { status: DigitalCardPaymentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

function CategoryBadge({ category }: { category: PaymentCategory }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#C9A0DC]/50 bg-[#F0DFF6]/60 px-2.5 py-1 text-xs font-semibold text-[#7E5896]">
      {PAYMENT_CATEGORY_BADGE[category]}
    </span>
  )
}

function CategoryTab({
  label,
  count,
  active,
  href,
}: {
  label: string
  count: number
  active: boolean
  href: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold transition-colors',
        active
          ? 'border-[#7E5896] text-[#7E5896]'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800',
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
          active ? 'bg-[#F0DFF6] text-[#7E5896]' : 'bg-gray-100 text-gray-500',
        )}
      >
        {count}
      </span>
    </Link>
  )
}

function ItemList({ payment }: { payment: DigitalCardPayment }) {
  if (payment.items.length === 0) return <p className="text-sm text-gray-500">No line items captured.</p>
  return (
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60">
      {payment.items.map((item, index) => (
        <div key={`${item.id ?? item.name ?? 'item'}-${index}`} className="flex items-start justify-between gap-4 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.image}
                alt=""
                className="h-12 w-9 shrink-0 rounded object-cover ring-1 ring-gray-200"
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{item.name ?? `${PAYMENT_CATEGORY_BADGE[payment.category]} item`}</p>
              {(() => {
                // The summary already contains tier · guests · add-ons, so use it
                // as the single source (avoids the tier/guests duplication) and
                // render each part as a pill instead of dot-separated text.
                const parts = item.summary
                  ? item.summary.split('·').map((s) => s.trim()).filter(Boolean)
                  : ([item.tier, item.guests != null ? `${item.guests.toLocaleString('en-US')} guests` : null].filter(Boolean) as string[])
                return parts.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {parts.map((part, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full bg-[#9FE870]/25 px-2 py-0.5 text-[11px] font-medium text-[#3f6b1f]"
                      >
                        {part}
                      </span>
                    ))}
                  </div>
                ) : null
              })()}
            </div>
          </div>
          {typeof item.total === 'number' && (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
              {formatTzs(item.total)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function ReviewForm({ payment, canWrite }: { payment: DigitalCardPayment; canWrite: boolean }) {
  const actionable = payment.status === 'processing' || payment.status === 'pending'
  if (actionable && !canWrite) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
        This payment needs review. Your account has finance read access, but not approval access.
      </div>
    )
  }
  if (!actionable) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
        Reviewed {formatDate(payment.reviewedAt)}
        {payment.reviewedBy ? ` by ${payment.reviewedBy}` : ''}
        {payment.reviewNote ? ` · ${payment.reviewNote}` : ''}
      </div>
    )
  }
  return (
    <form className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <input type="hidden" name="id" value={payment.id} />
      <label
        className="text-xs font-bold uppercase tracking-wider text-gray-500"
        htmlFor={`note-${payment.id}`}
      >
        Review note
      </label>
      <textarea
        id={`note-${payment.id}`}
        name="note"
        rows={3}
        placeholder="Add a note for the customer or finance record…"
        className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#7E5896] focus:bg-white focus:ring-2 focus:ring-[#F0DFF6]"
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
        <button
          type="submit"
          formAction={approveDigitalCardPayment}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#7E5896] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6c4884]"
        >
          <CheckCircle2 className="h-4 w-4" />
          Approve payment
        </button>
        <button
          type="submit"
          formAction={rejectDigitalCardPayment}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-5 py-2.5 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
        >
          <XCircle className="h-4 w-4" />
          Reject
        </button>
      </div>
    </form>
  )
}

function poolPct(pool: PoolUsage): number {
  return pool.purchased > 0 ? Math.min(100, Math.round((pool.used / pool.purchased) * 100)) : 0
}

function AdjustForm({
  userId,
  eventId,
  kind,
  label,
}: {
  userId: string
  eventId: string
  kind: 'invite' | 'entrance_pass'
  label: string
}) {
  const idBase = `${eventId}-${kind}`
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer font-medium text-[#7E5896] [&::-webkit-details-marker]:hidden">
        Adjust {label.toLowerCase()}
      </summary>
      <form className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2.5">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="kind" value={kind} />
        <div className="flex items-center gap-2">
          <input
            type="number"
            name="quantity"
            min={1}
            step={1}
            defaultValue={1}
            required
            aria-label="Credit quantity"
            className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6]"
          />
          <label htmlFor={`reason-${idBase}`} className="sr-only">
            Reason
          </label>
          <input
            id={`reason-${idBase}`}
            type="text"
            name="reason"
            required
            placeholder="Reason (required, kept on the audit trail)"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6]"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="submit"
            formAction={adjustEntitlementCredits.bind(null, 'revoke')}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
          >
            <Minus className="h-3.5 w-3.5" /> Revoke
          </button>
          <button
            type="submit"
            formAction={adjustEntitlementCredits.bind(null, 'grant')}
            className="inline-flex items-center gap-1 rounded-lg bg-[#7E5896] px-2.5 py-1.5 font-semibold text-white transition hover:bg-[#6c4884]"
          >
            <Plus className="h-3.5 w-3.5" /> Grant
          </button>
        </div>
      </form>
    </details>
  )
}

function PoolCard({
  icon,
  label,
  pool,
  userId,
  eventId,
  kind,
  canWrite,
}: {
  icon: ReactNode
  label: string
  pool: PoolUsage
  userId: string
  eventId: string
  kind: 'invite' | 'entrance_pass'
  canWrite: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <span className="inline-flex items-center gap-1.5 text-[#7E5896]">
          {icon}
          <span className="text-gray-500">{label}</span>
        </span>
        <span className="normal-case tracking-normal text-gray-900">
          {pool.used}/{pool.purchased}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-[#7E5896]" style={{ width: `${poolPct(pool)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        {pool.remaining} remaining
        {pool.adjustment !== 0 ? (
          <span className={pool.adjustment > 0 ? 'text-emerald-600' : 'text-rose-600'}>
            {' '}
            · {pool.adjustment > 0 ? '+' : ''}
            {pool.adjustment} admin adjustment
          </span>
        ) : null}
      </p>
      {canWrite ? <AdjustForm userId={userId} eventId={eventId} kind={kind} label={label} /> : null}
    </div>
  )
}

function CreditUsagePanel({
  payment,
  usage,
  canWrite,
}: {
  payment: DigitalCardPayment
  usage: EventCreditUsage | null
  canWrite: boolean
}) {
  if (payment.status !== 'paid') return null
  if (!payment.userId) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-xs text-gray-500">
        Guest checkout — no dashboard account to meter credits against.
      </div>
    )
  }
  if (!payment.eventId) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
        Not yet assigned to an event — the couple must assign this design before its credits count toward anything.
      </div>
    )
  }
  if (!usage) return null
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
        Send credits {usage.eventName ? `· ${usage.eventName}` : ''}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <PoolCard icon={<Send className="h-3.5 w-3.5" />} label="Invites" pool={usage.invite} userId={payment.userId} eventId={payment.eventId} kind="invite" canWrite={canWrite} />
        <PoolCard icon={<Ticket className="h-3.5 w-3.5" />} label="Entrance passes" pool={usage.entrancePass} userId={payment.userId} eventId={payment.eventId} kind="entrance_pass" canWrite={canWrite} />
      </div>
    </div>
  )
}

function PaymentCard({
  payment,
  canWrite,
  usage,
}: {
  payment: DigitalCardPayment
  canWrite: boolean
  usage: EventCreditUsage | null
}) {
  // Expanded by default while it still needs review; collapsed once reviewed so
  // the queue stays scannable. Native <details> — no client JS needed.
  const open = payment.status === 'processing' || payment.status === 'pending'
  return (
    <details
      open={open}
      className="group rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{payment.ref}</h2>
            <StatusBadge status={payment.status} />
            <CategoryBadge category={payment.category} />
            {/* Approving a top-up releases it on the spot and briefs no
                designer, so reviewers can see which kind they are approving
                before they click. */}
            {payment.orderKind === 'topup' && (
              <span className="inline-flex items-center rounded-full bg-[#9FE870]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[#3f6b1f]">
                Top-up · no design work
              </span>
            )}
          </div>
          {(() => {
            const t = dateTimeParts(payment.paymentSubmittedAt ?? payment.createdAt)
            return (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-gray-500">
                <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                {t ? (
                  <span>
                    Submitted {t.date} <span className="text-gray-400">at</span> {t.time}
                  </span>
                ) : (
                  <span>Submitted —</span>
                )}
              </p>
            )
          })()}
        </div>
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Invoice total</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{formatTzs(payment.amountTotal)}</p>
          </div>
          {/* Divider keeps the total and the toggle visually distinct */}
          <span aria-hidden className="h-10 w-px shrink-0 bg-gray-200" />
          {/* Collapse toggle — pinned to the right, clearly interactive */}
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors group-hover:border-[#C9A0DC] group-hover:text-[#7E5896] group-open:bg-[#F0DFF6] group-open:text-[#7E5896]"
          >
            <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" />
          </span>
        </div>
      </summary>

      <div className="grid items-start gap-5 px-5 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail icon={<Mail className="h-4 w-4" />} label="Customer" value={payment.contactName || payment.contactEmail} meta={payment.contactEmail} />
            <Detail icon={<Phone className="h-4 w-4" />} label="Contact phone" value={payment.contactPhone} />
            <Detail icon={<Smartphone className="h-4 w-4" />} label="Payer account" value={payment.payerName || '—'} meta={payment.payerPhone || undefined} />
            <Detail icon={<ReceiptText className="h-4 w-4" />} label="Reference" value={payment.paymentReference || '—'} meta="Lipa Namba 350298654" />
          </div>
          <ItemList payment={payment} />
          <CreditUsagePanel payment={payment} usage={usage} canWrite={canWrite} />
        </div>
        <ReviewForm payment={payment} canWrite={canWrite} />
      </div>
    </details>
  )
}

const FILTER_TABS: { key: PaymentFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Needs review' },
  { key: 'paid', label: 'Approved' },
  { key: 'failed', label: 'Rejected' },
]

function buildHref(opts: { filter?: PaymentFilter; category?: PaymentCategory | null; q?: string }): string {
  const params = new URLSearchParams()
  if (opts.category) params.set('category', opts.category)
  if (opts.filter && opts.filter !== 'all') params.set('filter', opts.filter)
  if (opts.q) params.set('q', opts.q)
  const qs = params.toString()
  return qs ? `/finance/payments?${qs}` : '/finance/payments'
}

// Category sub-tabs render in this order; a tab shows only when it has payments
// (plus "All", always). Communicates the payment taxonomy without empty tabs.
const CATEGORY_ORDER: PaymentCategory[] = [
  'digital_card',
  'thank_you_card',
  'pledge_card',
  'gift_registry',
  'attire_rings',
]

const VALID_CATEGORIES: PaymentCategory[] = [
  'digital_card',
  'thank_you_card',
  'pledge_card',
  'gift_registry',
  'attire_rings',
]

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; category?: string; q?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('finance.read'))) redirect('/')

  const sp = await searchParams
  const filter: PaymentFilter = (['review', 'paid', 'failed', 'all'] as const).includes(
    sp.filter as PaymentFilter,
  )
    ? (sp.filter as PaymentFilter)
    : 'all'
  const category: PaymentCategory | null = VALID_CATEGORIES.includes(sp.category as PaymentCategory)
    ? (sp.category as PaymentCategory)
    : null
  const q = (sp.q ?? '').trim()

  const [summary, payments, categoryCounts, canWrite] = await Promise.all([
    getDigitalCardPaymentSummary(category ?? undefined),
    getDigitalCardPayments({ filter, category: category ?? undefined, q }),
    getPaymentCategoryCounts(),
    hasPermission('finance.write'),
  ])
  const capped = payments.length === PAYMENTS_PAGE_SIZE
  const totalCount = Object.values(categoryCounts).reduce((s, n) => s + n, 0)

  // Usage only makes sense once a payment is approved AND assigned to an
  // event — everything else short-circuits inside CreditUsagePanel itself.
  const usageEntries = await Promise.all(
    payments.map(async (payment) => {
      if (payment.status !== 'paid' || !payment.userId || !payment.eventId) return null
      return [payment.id, await getEventCreditUsage(payment.userId, payment.eventId)] as const
    }),
  )
  const usageByPaymentId = new Map(usageEntries.filter((e): e is [string, EventCreditUsage] => e !== null))

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-6 pt-4 sm:px-6 sm:pb-8 lg:px-8 lg:pb-10">
      <PaymentsHeading />

      {/* Category sub-tabs — the primary dimension (which payment stream). The
          status pills below are the secondary filter within the chosen stream. */}
      <div className="mb-6 overflow-x-auto border-b border-gray-200">
        <nav className="-mb-px flex gap-x-6 whitespace-nowrap">
          <CategoryTab label="All" count={totalCount} active={category === null} href={buildHref({ filter, q })} />
          {CATEGORY_ORDER.filter((c) => categoryCounts[c] > 0).map((c) => (
            <CategoryTab
              key={c}
              label={PAYMENT_CATEGORY_LABEL[c]}
              count={categoryCounts[c]}
              active={category === c}
              href={buildHref({ filter, category: c, q })}
            />
          ))}
        </nav>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Needs review" value={String(summary.review)} icon={<AlertCircle className="h-4 w-4" />} href={buildHref({ filter: 'review', category, q })} active={filter === 'review'} />
        <Kpi label="Review value" value={compactTzs(summary.reviewValue)} icon={<Clock className="h-4 w-4" />} />
        <Kpi label="Approved" value={String(summary.paid)} icon={<CheckCircle2 className="h-4 w-4" />} href={buildHref({ filter: 'paid', category, q })} active={filter === 'paid'} />
        <Kpi label="Rejected" value={String(summary.failed)} icon={<XCircle className="h-4 w-4" />} href={buildHref({ filter: 'failed', category, q })} active={filter === 'failed'} />
      </div>

      {/* Filter tabs + search — scale to thousands of payments */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={buildHref({ filter: tab.key, category, q })}
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
        <form method="get" action="/finance/payments" className="flex items-center gap-2">
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          {category && <input type="hidden" name="category" value={category} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search ref, name, email, reference…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6] sm:w-72"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6c4884]"
          >
            Search
          </button>
        </form>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-gray-300" />
          <h2 className="mt-3 text-sm font-semibold text-gray-900">
            {q || filter !== 'all' || category ? 'No payments match these filters' : 'No payments yet'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {q || filter !== 'all' || category ? (
              <Link href="/finance/payments" className="text-[#7E5896] underline">
                Clear filters
              </Link>
            ) : (
              'Manual Lipa Namba submissions from checkout will appear here for approval.'
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {payments.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} canWrite={canWrite} usage={usageByPaymentId.get(payment.id) ?? null} />
            ))}
          </div>
          {capped && (
            <p className="mt-5 text-center text-xs text-gray-500">
              Showing the first {PAYMENTS_PAGE_SIZE}. Narrow with a filter or search to find a specific payment.
            </p>
          )}
        </>
      )}
    </div>
  )
}
