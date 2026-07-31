import { redirect } from 'next/navigation'
import { AlertTriangle, CalendarDays, Clock, Phone, ReceiptText, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { Kpi, Detail } from '../../_components/primitives'
import { formatTzs, formatDate } from '../../_components/format'
import { decideRefund, disburseRefund } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Cancellations and refunds.
 * Specs: OP-CCS-PRD-001 §7.11.
 *
 * The screen is deliberately arranged around the policy's own priority order:
 * most disputes should never become cash refunds, so the credit-note option
 * sits alongside approval rather than behind it. A credit note is worth 10%
 * more to the customer and costs us no cash today.
 *
 * The entitlement figure is NOT editable. It was frozen when the customer
 * asked, and an operator who thinks it is wrong has one honest route: a policy
 * exception, which needs CSFO authority and is logged as an exception rather
 * than quietly adjusted.
 */

type RefundRow = {
  id: string
  order_id: string
  requested_at: string
  requested_via: string
  status_at_request: string
  entitled_pct: number
  entitled_tzs: number
  reason: string
  customer_note: string | null
  state: string
  resolution: string | null
  approver_note: string | null
  policy_exception: boolean
  payout_msisdn: string | null
  disbursed_at: string | null
}

const REASON_LABEL: Record<string, string> = {
  customer_cancelled: 'Customer cancelled',
  event_cancelled: 'Event called off',
  event_postponed_declined: 'Postponement declined',
  opusfesta_fault: 'Our fault',
  sla_breach: 'We missed the SLA',
  defective_deliverable: 'Defective deliverable',
  force_majeure: 'Force majeure',
  duplicate_payment: 'Duplicate payment',
  other: 'Other',
}

const FAULT_REASONS = ['opusfesta_fault', 'sla_breach', 'defective_deliverable', 'force_majeure']

export default async function CommissionRefundsPage(props: {
  searchParams: Promise<{ done?: string; error?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/sign-in')
  if (!(await hasPermission('finance.read'))) redirect('/')
  const canDecide = await hasPermission('finance.write')
  const isCsfo = await hasPermission('platform.admin')

  const searchParams = await props.searchParams
  const supabase = createSupabaseAdminClient()

  const { data: requests } = await supabase
    .from('refund_requests')
    .select('id, order_id, requested_at, requested_via, status_at_request, entitled_pct, entitled_tzs, reason, customer_note, state, resolution, approver_note, policy_exception, payout_msisdn, disbursed_at')
    .in('state', ['requested', 'approved'])
    .order('requested_at', { ascending: true })
    .returns<RefundRow[]>()

  const rows = requests ?? []
  const orderIds = [...new Set(rows.map((r) => r.order_id))]
  const { data: orders } = orderIds.length
    ? await supabase
        .from('card_orders')
        .select('id, order_no, buyer_name, buyer_phone, package_id, provisional_event_name')
        .in('id', orderIds)
        .returns<{ id: string; order_no: string; buyer_name: string; buyer_phone: string; package_id: string; provisional_event_name: string | null }[]>()
    : { data: [] }
  const orderById = new Map((orders ?? []).map((o) => [o.id, o]))

  // §7.11.9 — repeat requesters, flagged for CSFO review.
  const { data: watchlist } = await supabase
    .from('commission_refund_watchlist')
    .select('buyer_phone, refund_requests, total_requested_tzs')
    .returns<{ buyer_phone: string; refund_requests: number; total_requested_tzs: number }[]>()
  const flagged = new Set((watchlist ?? []).map((w) => w.buyer_phone))

  const awaitingDecision = rows.filter((r) => r.state === 'requested')
  const awaitingPayout = rows.filter((r) => r.state === 'approved')
  const exposure = rows.reduce((n, r) => n + r.entitled_tzs, 0)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Cancellations and refunds
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Entitlement is computed from the state at the moment the customer asked, never from
          today, so our processing time cannot reduce what they are owed. The figure is not
          editable — if it is wrong, that is a policy exception and needs CSFO authority.
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Awaiting decision" value={String(awaitingDecision.length)} icon={<Clock size={16} />} />
        <Kpi label="Approved, not paid" value={String(awaitingPayout.length)} icon={<Wallet size={16} />} />
        <Kpi label="Open exposure" value={formatTzs(exposure)} icon={<ReceiptText size={16} />} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-gray-900">Nothing open</p>
          <p className="mt-1 text-sm text-gray-600">No cancellation requests are waiting.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const order = orderById.get(row.order_id)
            const isFault = FAULT_REASONS.includes(row.reason)
            const isFlagged = order ? flagged.has(order.buyer_phone) : false

            return (
              <details
                key={row.id}
                className="group rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                      row.state === 'approved'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800',
                    )}
                  >
                    {row.state === 'approved' ? 'Awaiting payout' : 'Needs a decision'}
                  </span>
                  <span className="font-mono text-sm font-semibold text-gray-900">
                    {order?.order_no ?? '—'}
                  </span>
                  <span className="text-sm text-gray-700">{order?.buyer_name ?? '—'}</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatTzs(row.entitled_tzs)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {row.entitled_pct}% · {REASON_LABEL[row.reason] ?? row.reason}
                  </span>
                  {isFault && (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                      Our fault — 100%
                    </span>
                  )}
                  {isFlagged && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                      <AlertTriangle size={12} />
                      3+ requests in 12 months
                    </span>
                  )}
                </summary>

                <div className="space-y-4 border-t border-gray-100 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Detail
                      icon={<Clock size={14} />}
                      label="Requested"
                      value={formatDate(row.requested_at)}
                      meta={`via ${row.requested_via}`}
                    />
                    <Detail
                      icon={<CalendarDays size={14} />}
                      label="State when asked"
                      value={row.status_at_request.replace(/_/g, ' ')}
                      meta={`entitlement frozen at ${row.entitled_pct}%`}
                    />
                    <Detail
                      icon={<Phone size={14} />}
                      label="Customer"
                      value={order?.buyer_phone ?? '—'}
                      meta={order?.provisional_event_name ?? undefined}
                    />
                    <Detail
                      icon={<Wallet size={14} />}
                      label="Entitled"
                      value={formatTzs(row.entitled_tzs)}
                      meta={`credit note alternative: ${formatTzs(Math.floor(row.entitled_tzs * 1.1))}`}
                    />
                  </div>

                  {row.customer_note && (
                    <p className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-sm text-gray-700">
                      <span className="font-semibold">What they said: </span>
                      {row.customer_note}
                    </p>
                  )}

                  {row.state === 'requested' && canDecide && (
                    <div className="grid gap-4 lg:grid-cols-3">
                      <form action={decide} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                        <input type="hidden" name="requestId" value={row.id} />
                        <input type="hidden" name="decision" value="credit_note" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Credit note
                        </p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {formatTzs(Math.floor(row.entitled_tzs * 1.1))} — worth more to them, and
                          no cash leaves today. Offer this first.
                        </p>
                        <input
                          name="note"
                          required
                          minLength={3}
                          placeholder="Reason / what you agreed"
                          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                        <button
                          type="submit"
                          className="mt-2 w-full rounded-lg bg-[#4A2D5C] px-4 py-2 text-sm font-semibold text-white"
                        >
                          Issue a credit note
                        </button>
                      </form>

                      <form action={decide} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                        <input type="hidden" name="requestId" value={row.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Approve cash
                        </p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {formatTzs(row.entitled_tzs)}. Approval does not move money — you disburse
                          separately.
                        </p>
                        <input
                          name="note"
                          required
                          minLength={3}
                          placeholder="Reason"
                          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                        {isCsfo && (
                          <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
                            <input type="checkbox" name="exception" value="1" />
                            Policy exception (outside the tier table)
                          </label>
                        )}
                        <button
                          type="submit"
                          className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                        >
                          Approve
                        </button>
                      </form>

                      <form action={decide} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                        <input type="hidden" name="requestId" value={row.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Reject
                        </p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          The customer sees this reason on their order.
                        </p>
                        <input
                          name="note"
                          required
                          minLength={3}
                          placeholder="Why (required)"
                          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                        <button
                          type="submit"
                          className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700"
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  )}

                  {row.state === 'approved' && canDecide && (
                    <form action={disburse} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                      <input type="hidden" name="requestId" value={row.id} />
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Record the payout
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Do this only AFTER the transfer has confirmed. The negative ledger row is
                        written here, so recording early would overstate what we have refunded.
                      </p>
                      <label className="mt-2 block text-xs font-medium text-gray-700">
                        Mobile money number paid
                        <input
                          name="msisdn"
                          required
                          defaultValue={order?.buyer_phone ?? ''}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
                        <input type="checkbox" name="confirmMismatch" value="1" />
                        I confirmed a different number directly with the customer
                      </label>
                      {row.approver_note && (
                        <p className="mt-2 text-[11px] text-gray-500">
                          Approved with note: {row.approver_note}
                        </p>
                      )}
                      <button
                        type="submit"
                        className="mt-2 rounded-lg bg-[#4A2D5C] px-4 py-2 text-sm font-semibold text-white"
                      >
                        Record disbursement
                      </button>
                    </form>
                  )}

                  {!canDecide && (
                    <p className="text-sm text-gray-500">
                      You have read-only access to Finance.
                    </p>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}

async function decide(formData: FormData): Promise<void> {
  'use server'
  const r = await decideRefund(formData)
  redirect(
    `/finance/commissions/refunds?${r.ok ? 'done' : 'error'}=${encodeURIComponent(r.message)}`,
  )
}

async function disburse(formData: FormData): Promise<void> {
  'use server'
  const r = await disburseRefund(formData)
  redirect(
    `/finance/commissions/refunds?${r.ok ? 'done' : 'error'}=${encodeURIComponent(r.message)}`,
  )
}
