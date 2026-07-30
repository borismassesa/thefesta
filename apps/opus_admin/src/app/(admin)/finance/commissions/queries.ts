import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * The Finance review queue for the Custom Card Commission Service.
 * Specs: OP-CCS-PRD-001 §7.2.4; OP-CCS-TDD-001 §5.2.
 *
 * ONE queue serves BOTH money gates. It is parameterised by payment purpose
 * rather than duplicated, because the deposit review and the balance review are
 * the same job: match a Lipa Namba reference against the merchant statement,
 * then approve or reject with a note.
 *
 * Ordering is not chronological. Balance reviews sort above deposit reviews
 * regardless of age, because a customer waiting on a balance has already
 * approved a finished card and is waiting on the file itself — that queue
 * position is the difference between "paid and delivered in one motion" and a
 * support ticket.
 */

export type CommissionPaymentPurpose = 'deposit' | 'balance' | 'topup'
export type QueueFilter = 'all' | 'balance' | 'deposit' | 'overdue_sla'

/** Finance reviews within 4 working hours; unreviewed items escalate at 6. */
export const FINANCE_SLA_HOURS = 4
export const FINANCE_ESCALATION_HOURS = 6

export type PendingPayment = {
  paymentId: string
  orderId: string
  orderNo: string
  purpose: CommissionPaymentPurpose
  /** What we asked for at the time this reference was submitted. */
  expectedTzs: number
  reference: string | null
  evidencePath: string | null
  submittedAt: string
  hoursWaiting: number

  buyerName: string
  buyerPhone: string
  buyerEmail: string | null
  locale: string
  eventName: string | null
  eventDate: string | null
  packageId: string
  categoryId: string

  orderStatus: string
  /** Derived, never stored. */
  totalTzs: number
  paidTzs: number
  outstandingTzs: number
  depositDueTzs: number
  depositPaidTzs: number
  /**
   * How far short of opening this payment's gate the order still is, assuming
   * the expected amount arrives. Rendered in red so a rushed officer cannot
   * approve an insufficient amount by accident — and the database refuses it
   * outright anyway (loophole L18).
   */
  shortfallIfExpected: number
}

export type QueueSummary = {
  total: number
  balanceCount: number
  depositCount: number
  overdueCount: number
  /** Money sitting unverified. Not revenue — a claim awaiting a human. */
  pendingTzs: number
}

type PaymentRow = {
  id: string
  order_id: string
  purpose: CommissionPaymentPurpose
  expected_tzs: number
  provider_ref: string | null
  evidence_path: string | null
  created_at: string
}

type OrderRow = {
  id: string
  order_no: string
  status: string
  buyer_name: string
  buyer_phone: string
  buyer_email: string | null
  locale: string
  provisional_event_name: string | null
  provisional_event_date: string | null
  package_id: string
  category_id: string
  deposit_due_tzs: number
}

type LedgerRow = {
  order_id: string
  total_tzs: number
  effective_total_tzs: number
  paid_tzs: number
  deposit_paid_tzs: number
  deposit_due_tzs: number
  outstanding_tzs: number
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

export async function getPendingCommissionPayments(
  filter: QueueFilter = 'all',
): Promise<PendingPayment[]> {
  const supabase = createSupabaseAdminClient()

  const { data: payments, error } = await supabase
    .from('order_payments')
    .select('id, order_id, purpose, expected_tzs, provider_ref, evidence_path, created_at')
    .eq('state', 'pending_review')
    .order('created_at', { ascending: true })
    .returns<PaymentRow[]>()
  if (error) throw new Error(`getPendingCommissionPayments failed: ${error.message}`)
  if (!payments || payments.length === 0) return []

  const orderIds = [...new Set(payments.map((p) => p.order_id))]
  const [{ data: orders }, { data: ledgers }] = await Promise.all([
    supabase
      .from('card_orders')
      .select('id, order_no, status, buyer_name, buyer_phone, buyer_email, locale, provisional_event_name, provisional_event_date, package_id, category_id, deposit_due_tzs')
      .in('id', orderIds)
      .returns<OrderRow[]>(),
    supabase
      .from('order_ledger')
      .select('order_id, total_tzs, effective_total_tzs, paid_tzs, deposit_paid_tzs, deposit_due_tzs, outstanding_tzs')
      .in('order_id', orderIds)
      .returns<LedgerRow[]>(),
  ])

  const orderById = new Map((orders ?? []).map((o) => [o.id, o]))
  const ledgerById = new Map((ledgers ?? []).map((l) => [l.order_id, l]))

  const rows: PendingPayment[] = []
  for (const p of payments) {
    const order = orderById.get(p.order_id)
    const ledger = ledgerById.get(p.order_id)
    // An orphan payment row would mean a deleted order; skipping it silently
    // would hide a real data problem, so it is logged.
    if (!order || !ledger) {
      console.error('[commission-finance] pending payment with no order/ledger', p.id)
      continue
    }

    // Would the expected amount actually open this payment's gate?
    const depositTarget = Math.min(ledger.deposit_due_tzs, Math.max(ledger.effective_total_tzs, 0))
    const shortfallIfExpected =
      p.purpose === 'deposit'
        ? Math.max(depositTarget - (ledger.deposit_paid_tzs + p.expected_tzs), 0)
        : Math.max(ledger.outstanding_tzs - p.expected_tzs, 0)

    rows.push({
      paymentId: p.id,
      orderId: p.order_id,
      orderNo: order.order_no,
      purpose: p.purpose,
      expectedTzs: p.expected_tzs,
      reference: p.provider_ref,
      evidencePath: p.evidence_path,
      submittedAt: p.created_at,
      hoursWaiting: hoursSince(p.created_at),
      buyerName: order.buyer_name,
      buyerPhone: order.buyer_phone,
      buyerEmail: order.buyer_email,
      locale: order.locale,
      eventName: order.provisional_event_name,
      eventDate: order.provisional_event_date,
      packageId: order.package_id,
      categoryId: order.category_id,
      orderStatus: order.status,
      totalTzs: ledger.total_tzs,
      paidTzs: ledger.paid_tzs,
      outstandingTzs: Math.max(ledger.outstanding_tzs, 0),
      depositDueTzs: ledger.deposit_due_tzs,
      depositPaidTzs: ledger.deposit_paid_tzs,
      shortfallIfExpected,
    })
  }

  // Balance first, then longest-waiting. See the note at the top of this file.
  rows.sort((a, b) => {
    if (a.purpose !== b.purpose) {
      if (a.purpose === 'balance') return -1
      if (b.purpose === 'balance') return 1
    }
    return a.submittedAt.localeCompare(b.submittedAt)
  })

  switch (filter) {
    case 'balance':
      return rows.filter((r) => r.purpose === 'balance')
    case 'deposit':
      return rows.filter((r) => r.purpose === 'deposit')
    case 'overdue_sla':
      return rows.filter((r) => r.hoursWaiting >= FINANCE_SLA_HOURS)
    default:
      return rows
  }
}

export function summarise(rows: PendingPayment[]): QueueSummary {
  return {
    total: rows.length,
    balanceCount: rows.filter((r) => r.purpose === 'balance').length,
    depositCount: rows.filter((r) => r.purpose === 'deposit').length,
    overdueCount: rows.filter((r) => r.hoursWaiting >= FINANCE_SLA_HOURS).length,
    pendingTzs: rows.reduce((n, r) => n + r.expectedTzs, 0),
  }
}

export const PURPOSE_LABEL: Record<CommissionPaymentPurpose, string> = {
  deposit: 'Deposit (50%)',
  balance: 'Balance',
  topup: 'Revision top-up',
}

export const PURPOSE_BADGE: Record<CommissionPaymentPurpose, string> = {
  // Balance is the urgent one: the work is already done and the customer is
  // waiting on a file.
  balance: 'border-amber-200 bg-amber-50 text-amber-800',
  deposit: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  topup: 'border-blue-200 bg-blue-50 text-blue-700',
}
