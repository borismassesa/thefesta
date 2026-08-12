import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Clock,
  Hash,
  Phone,
  ReceiptText,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { Kpi, Detail } from '../_components/primitives'
import { formatTzs, compactTzs, formatDate } from '../_components/format'
import { approveCommissionPayment, rejectCommissionPayment } from './actions'
import {
  FINANCE_SLA_HOURS,
  PURPOSE_BADGE,
  PURPOSE_LABEL,
  getPendingCommissionPayments,
  summarise,
  type PendingPayment,
  type QueueFilter,
} from './queries'

export const dynamic = 'force-dynamic'

/**
 * Finance review queue for custom card commissions.
 * Specs: OP-CCS-PRD-001 §7.2.4.
 *
 * One queue, both money gates. Every row shows the five things an officer
 * needs before deciding — instalment type, expected amount, submitted
 * reference, buyer phone and time waiting — without expanding anything.
 *
 * The shortfall is rendered in red BEFORE the officer commits. The database
 * refuses to open a gate on an insufficient amount regardless (loophole L18),
 * but a red number is how you stop someone approving one by accident rather
 * than discovering it afterwards.
 */

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'all', label: 'All waiting' },
  { key: 'balance', label: 'Balance' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'overdue_sla', label: `Over ${FINANCE_SLA_HOURS}h` },
]

function waitingLabel(hours: number): string {
  if (hours < 1) return `${Math.max(Math.round(hours * 60), 1)}m waiting`
  if (hours < 48) return `${Math.round(hours)}h waiting`
  return `${Math.round(hours / 24)}d waiting`
}

export default async function CommissionFinanceQueuePage(props: {
  searchParams: Promise<{ filter?: string; done?: string; error?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/sign-in')
  if (!(await hasPermission('finance.read'))) redirect('/')
  const canDecide = await hasPermission('finance.write')

  const searchParams = await props.searchParams
  const filter = (FILTERS.find((f) => f.key === searchParams.filter)?.key ?? 'all') as QueueFilter

  // The summary counts the WHOLE queue, so switching filters never changes the
  // KPI figures — a tile whose number moves when you click it is unreadable.
  const all = await getPendingCommissionPayments('all')
  const summary = summarise(all)
  const rows =
    filter === 'all'
      ? all
      : filter === 'balance'
        ? all.filter((r) => r.purpose === 'balance')
        : filter === 'deposit'
          ? all.filter((r) => r.purpose === 'deposit')
          : all.filter((r) => r.hoursWaiting >= FINANCE_SLA_HOURS)

  const href = (key: QueueFilter) => `/finance/commissions${key === 'all' ? '' : `?filter=${key}`}`

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Commission payments
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Lipa Namba references awaiting verification, for both instalments. Match each reference
          against the merchant statement, then record the amount that actually arrived. Balance
          reviews sort first: that customer has already approved a finished card and is waiting on
          the file.
        </p>
      </header>

      {searchParams.done && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {searchParams.done}
        </p>
      )}
      {searchParams.error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {searchParams.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Waiting"
          value={String(summary.total)}
          icon={<ReceiptText size={16} />}
          href={href('all')}
          active={filter === 'all'}
        />
        <Kpi
          label="Balance"
          value={String(summary.balanceCount)}
          icon={<Wallet size={16} />}
          href={href('balance')}
          active={filter === 'balance'}
        />
        <Kpi
          label="Deposit"
          value={String(summary.depositCount)}
          icon={<BadgeCheck size={16} />}
          href={href('deposit')}
          active={filter === 'deposit'}
        />
        <Kpi
          label={`Over ${FINANCE_SLA_HOURS}h`}
          value={String(summary.overdueCount)}
          icon={<Clock size={16} />}
          href={href('overdue_sla')}
          active={filter === 'overdue_sla'}
        />
      </div>

      <p className="text-sm text-gray-600">
        {compactTzs(summary.pendingTzs)} claimed but unverified. This is not revenue until someone
        has matched it.
      </p>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={href(f.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              filter === f.key
                ? 'border-[#C9A0DC] bg-[#F5EFF7] text-[#4A2D5C]'
                : 'border-gray-200 bg-white text-gray-600 hover:border-[#C9A0DC]',
            )}
          >
            {f.label}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-gray-900">Nothing waiting</p>
          <p className="mt-1 text-sm text-gray-600">
            Every submitted reference has been reviewed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <QueueRow key={row.paymentId} row={row} canDecide={canDecide} />
          ))}
        </div>
      )}
    </div>
  )
}

function QueueRow({ row, canDecide }: { row: PendingPayment; canDecide: boolean }) {
  const breached = row.hoursWaiting >= FINANCE_SLA_HOURS
  // Would the amount we asked for actually open this gate? If not, say so
  // before the officer decides anything.
  const wouldStillBeShort = row.shortfallIfExpected > 0

  return (
    <details className="group rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
        <span
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            PURPOSE_BADGE[row.purpose],
          )}
        >
          {PURPOSE_LABEL[row.purpose]}
        </span>
        <span className="font-mono text-sm font-semibold text-gray-900">{row.orderNo}</span>
        <span className="text-sm text-gray-700">{row.buyerName}</span>
        <span className="text-sm font-semibold text-gray-900">{formatTzs(row.expectedTzs)}</span>
        <span className="font-mono text-xs text-gray-500">{row.reference ?? 'no reference'}</span>
        <span
          className={cn(
            'text-xs font-semibold',
            breached ? 'text-rose-600' : 'text-gray-500',
          )}
        >
          {waitingLabel(row.hoursWaiting)}
        </span>
        {wouldStillBeShort && (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
            <AlertTriangle size={12} />
            Short by {formatTzs(row.shortfallIfExpected)}
          </span>
        )}
        <ChevronDown
          size={16}
          className="ml-auto text-gray-400 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="space-y-4 border-t border-gray-100 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail
            icon={<Hash size={14} />}
            label="Reference"
            value={row.reference ?? '—'}
            meta="Match this against the merchant statement"
          />
          <Detail
            icon={<Phone size={14} />}
            label="Buyer"
            value={row.buyerPhone}
            meta={row.buyerEmail ?? 'no email given'}
          />
          <Detail
            icon={<CalendarDays size={14} />}
            label="Event"
            value={row.eventName ?? 'Not named yet'}
            meta={row.eventDate ? formatDate(`${row.eventDate}T00:00:00Z`) : 'no date given'}
          />
          <Detail
            icon={<Clock size={14} />}
            label="Submitted"
            value={formatDate(row.submittedAt)}
            meta={`${row.packageId} · ${row.categoryId}`}
          />
        </div>

        {/* The order's whole financial position, derived — so the officer can
            see what approving this will and will not achieve. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail icon={<ReceiptText size={14} />} label="Order total" value={formatTzs(row.totalTzs)} />
          <Detail icon={<Wallet size={14} />} label="Paid so far" value={formatTzs(row.paidTzs)} />
          <Detail
            icon={<BadgeCheck size={14} />}
            label="Deposit"
            value={`${formatTzs(row.depositPaidTzs)} of ${formatTzs(row.depositDueTzs)}`}
          />
          <Detail
            icon={<AlertTriangle size={14} />}
            label="Outstanding"
            value={formatTzs(row.outstandingTzs)}
          />
        </div>

        {wouldStillBeShort && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Even if the full {formatTzs(row.expectedTzs)} arrived, this order would still be{' '}
            {formatTzs(row.shortfallIfExpected)} short of{' '}
            {row.purpose === 'deposit' ? 'entering the design queue' : 'releasing the card'}.
            Approving records the money and tells the customer what remains — it does not open the
            gate.
          </p>
        )}

        {canDecide ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <form action={approve} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <input type="hidden" name="paymentId" value={row.paymentId} />
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Approve
              </p>
              <label className="mt-3 block text-xs font-medium text-gray-700">
                Amount that actually arrived (TZS)
                <input
                  name="receivedTzs"
                  inputMode="numeric"
                  defaultValue={row.expectedTzs}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
              <p className="mt-1 text-[11px] text-gray-500">
                Record what the statement shows, not what we asked for. The ledger works out the
                rest.
              </p>
              <label className="mt-3 block text-xs font-medium text-gray-700">
                What you matched it against
                <input
                  name="note"
                  required
                  minLength={3}
                  placeholder="e.g. M-Pesa statement 30 Jul, line 42"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="submit"
                className="mt-3 w-full rounded-lg bg-[#4A2D5C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3b2449]"
              >
                Approve payment
              </button>
            </form>

            <form action={reject} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <input type="hidden" name="paymentId" value={row.paymentId} />
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Reject</p>
              <label className="mt-3 block text-xs font-medium text-gray-700">
                Reason (the customer sees this)
                <input
                  name="note"
                  required
                  minLength={3}
                  placeholder="e.g. no matching payment found for that reference"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
              <button data-opus-button="danger" data-opus-button-size="medium"
                type="submit"
                className="mt-3 w-full rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
              >
                Reject payment
              </button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            You have read-only access to Finance. Ask an owner for finance.write to review payments.
          </p>
        )}
      </div>
    </details>
  )
}

// Server actions must return void from a form action; both helpers redirect
// back with the outcome so the operator always sees what happened.
async function approve(formData: FormData): Promise<void> {
  'use server'
  const result = await approveCommissionPayment(formData)
  redirect(
    `/finance/commissions?${result.ok ? 'done' : 'error'}=${encodeURIComponent(result.message)}`,
  )
}

async function reject(formData: FormData): Promise<void> {
  'use server'
  const result = await rejectCommissionPayment(formData)
  redirect(
    `/finance/commissions?${result.ok ? 'done' : 'error'}=${encodeURIComponent(result.message)}`,
  )
}
