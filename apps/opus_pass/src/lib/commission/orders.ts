import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import type {
  CardOrderStatus,
  OrderLedger,
  PaymentChannel,
  PaymentPurpose,
  PaymentState,
} from '@opusfesta/lib'

/**
 * Data access for the Custom Card Commission Service.
 * Specs: OP-CCS-PRD-001, OP-CCS-TDD-001 §3, §8.
 *
 * Two rules govern this whole module and are not negotiable:
 *
 *   1. NOTHING here writes `card_orders.status`. Every state change goes
 *      through `transitionOrder()`, which calls the Postgres function of the
 *      same name. The column's UPDATE grant is revoked from anon and
 *      authenticated precisely so this cannot be worked around.
 *
 *   2. NOTHING here trusts a client-supplied amount. Prices are recomputed
 *      from `card_packages` on every call (loophole L13).
 *
 * All reads and writes use the service-role client; RLS denies everyone else,
 * and the per-audience scoping lives in the routes above this layer.
 */

export type CardOrderRow = {
  id: string
  order_no: string
  status: CardOrderStatus
  user_id: string | null
  event_id: string | null
  buyer_phone: string
  buyer_name: string
  buyer_email: string | null
  locale: 'en' | 'sw'
  provisional_event_name: string | null
  provisional_event_date: string | null
  package_id: string
  category_id: string
  base_price_tzs: number
  total_tzs: number
  deposit_percent: number
  deposit_due_tzs: number
  currency: string
  revisions_remaining: number | null
  revisions_used: number
  assigned_designer_id: string | null
  assigned_at: string | null
  accepted_at: string | null
  sla_due_at: string | null
  approved_at: string | null
  balance_invoiced_at: string | null
  balance_due_at: string | null
  settled_at: string | null
  delivered_at: string | null
  archived_at: string | null
  created_at: string
}

// One literal string, not a concatenation: supabase-js parses the column list
// at the type level, and a concatenated expression widens to `string`, which
// makes every select() return GenericStringError instead of a row.
export const ORDER_COLS =
  'id, order_no, status, user_id, event_id, buyer_phone, buyer_name, buyer_email, locale, provisional_event_name, provisional_event_date, package_id, category_id, base_price_tzs, total_tzs, deposit_percent, deposit_due_tzs, currency, revisions_remaining, revisions_used, assigned_designer_id, assigned_at, accepted_at, sla_due_at, approved_at, balance_invoiced_at, balance_due_at, settled_at, delivered_at, archived_at, created_at'

// ─────────────────────────────────────────────────────────────────────────────
//  Catalogue
// ─────────────────────────────────────────────────────────────────────────────

export type PackageRow = {
  id: string
  name_en: string
  name_sw: string
  price_tzs: number
  deposit_percent: number
  first_draft_hours: number
  revisions_included: number | null
  revisions_fair_use: number | null
  topup_price_tzs: number
  auto_approve_days: number
  active: boolean
  sort_order: number
}

/**
 * The authoritative price source. Only ACTIVE packages are returned, which is
 * what stops an order being taken against the placeholder prices the packages
 * ship with (see the seed comment in the core migration).
 */
export async function getActivePackage(id: string): Promise<PackageRow | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('card_packages')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle()
  if (error) throw new Error(`getActivePackage failed: ${error.message}`)
  return (data as PackageRow) ?? null
}

export async function listActivePackages(): Promise<PackageRow[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('card_packages')
    .select('*')
    .eq('active', true)
    .order('sort_order')
  if (error) throw new Error(`listActivePackages failed: ${error.message}`)
  return (data as PackageRow[]) ?? []
}

export async function getActiveCategory(id: string): Promise<{ id: string; ticketed: boolean } | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('card_categories')
    .select('id, ticketed')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle()
  if (error) throw new Error(`getActiveCategory failed: ${error.message}`)
  return (data as { id: string; ticketed: boolean }) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
//  Orders
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrderById(id: string): Promise<CardOrderRow | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('card_orders').select(ORDER_COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(`getOrderById failed: ${error.message}`)
  return (data as CardOrderRow) ?? null
}

export async function getOrderByNo(orderNo: string): Promise<CardOrderRow | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('card_orders').select(ORDER_COLS).eq('order_no', orderNo).maybeSingle()
  if (error) throw new Error(`getOrderByNo failed: ${error.message}`)
  return (data as CardOrderRow) ?? null
}

/**
 * Create a commission at `draft`, then move it to `awaiting_deposit`.
 *
 * `idempotencyKey` is a UNIQUE column, so a double-tapped pay button produces a
 * constraint violation rather than a second commission (loophole L12). The
 * caller keys it on phone + package + a coarse time bucket; on collision we
 * return the ORIGINAL order, because from the buyer's point of view their tap
 * worked — showing them an error would make them tap again.
 */
export async function createCommissionOrder(input: {
  buyerName: string
  buyerPhone: string
  buyerEmail: string | null
  locale: 'en' | 'sw'
  packageId: string
  categoryId: string
  provisionalEventName: string | null
  provisionalEventDate: string | null
  /** Set only when the buyer was signed in at checkout. */
  userId: string | null
  eventId: string | null
  idempotencyKey: string
}): Promise<{ order: CardOrderRow; reused: boolean }> {
  const supabase = createSupabaseServerClient()

  const pkg = await getActivePackage(input.packageId)
  if (!pkg) throw new Error(`package ${input.packageId} is not available`)
  const category = await getActiveCategory(input.categoryId)
  if (!category) throw new Error(`category ${input.categoryId} is not available`)

  // Every money figure is derived here, server-side, from the package row.
  // Nothing the client sent is used (loophole L13). deposit_due is snapshotted
  // so a later price change cannot alter what this buyer was asked for.
  const basePrice = pkg.price_tzs
  const depositDue = Math.floor((basePrice * pkg.deposit_percent) / 100)

  const { data: orderNoData, error: noError } = await supabase.rpc('next_card_order_no')
  if (noError) throw new Error(`could not mint an order number: ${noError.message}`)

  const { data, error } = await supabase
    .from('card_orders')
    .insert({
      order_no: orderNoData as string,
      user_id: input.userId,
      event_id: input.eventId,
      buyer_phone: input.buyerPhone,
      buyer_name: input.buyerName,
      buyer_email: input.buyerEmail,
      locale: input.locale,
      provisional_event_name: input.provisionalEventName,
      provisional_event_date: input.provisionalEventDate,
      package_id: pkg.id,
      category_id: category.id,
      base_price_tzs: basePrice,
      total_tzs: basePrice,
      deposit_percent: pkg.deposit_percent,
      deposit_due_tzs: depositDue,
      revisions_remaining: pkg.revisions_included,
      idempotency_key: input.idempotencyKey,
    })
    .select(ORDER_COLS)
    .single()

  if (error) {
    // 23505 = unique_violation on idempotency_key. The buyer double-tapped.
    if ((error as { code?: string }).code === '23505') {
      const { data: existing } = await supabase
        .from('card_orders').select(ORDER_COLS)
        .eq('idempotency_key', input.idempotencyKey).maybeSingle()
      if (existing) return { order: existing as CardOrderRow, reused: true }
    }
    throw new Error(`createCommissionOrder failed: ${error.message}`)
  }

  const order = await transitionOrder({
    orderId: (data as CardOrderRow).id,
    to: 'awaiting_deposit',
    eventType: 'order.created',
    actorType: 'system',
  })
  return { order, reused: false }
}

// ─────────────────────────────────────────────────────────────────────────────
//  The only way status ever changes
// ─────────────────────────────────────────────────────────────────────────────

export class TransitionError extends Error {
  constructor(message: string, readonly orderId: string, readonly to: CardOrderStatus) {
    super(message)
    this.name = 'TransitionError'
  }
}

/**
 * Calls the Postgres `transition_order()`. That function validates the
 * transition table, runs the money gates, writes the status, appends an
 * immutable timeline event and enqueues notifications — all in one
 * transaction. A guard failure surfaces here as a TransitionError carrying the
 * database's own message, which is written to be shown to an operator.
 */
export async function transitionOrder(input: {
  orderId: string
  to: CardOrderStatus
  eventType: string
  actorType: 'customer' | 'designer' | 'finance' | 'admin' | 'system'
  actorId?: string | null
  payload?: Record<string, unknown>
}): Promise<CardOrderRow> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.rpc('transition_order', {
    p_order_id: input.orderId,
    p_to: input.to,
    p_event_type: input.eventType,
    p_actor_type: input.actorType,
    p_actor_id: input.actorId ?? null,
    p_payload: input.payload ?? {},
  })
  if (error) throw new TransitionError(error.message, input.orderId, input.to)
  // The function returns a card_orders composite; supabase-js surfaces it as a
  // single object, but a row-returning RPC can arrive wrapped in an array.
  const row = Array.isArray(data) ? data[0] : data
  return row as CardOrderRow
}

// ─────────────────────────────────────────────────────────────────────────────
//  Money
// ─────────────────────────────────────────────────────────────────────────────

export async function getLedger(orderId: string): Promise<OrderLedger | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('order_ledger').select('*').eq('order_id', orderId).maybeSingle()
  if (error) throw new Error(`getLedger failed: ${error.message}`)
  if (!data) return null
  const r = data as Record<string, number | string>
  return {
    orderId: String(r.order_id),
    totalTzs: Number(r.total_tzs),
    depositDueTzs: Number(r.deposit_due_tzs),
    creditsTzs: Number(r.credits_tzs),
    effectiveTotalTzs: Number(r.effective_total_tzs),
    paidTzs: Number(r.paid_tzs),
    depositPaidTzs: Number(r.deposit_paid_tzs),
    outstandingTzs: Number(r.outstanding_tzs),
  }
}

export type PaymentRow = {
  id: string
  order_id: string
  purpose: PaymentPurpose
  channel: PaymentChannel
  state: PaymentState
  expected_tzs: number
  received_tzs: number | null
  provider_ref: string | null
  evidence_path: string | null
  verified_by: string | null
  verified_at: string | null
  review_note: string | null
  created_at: string
}

export async function listPayments(orderId: string): Promise<PaymentRow[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('order_payments')
    .select('id, order_id, purpose, channel, state, expected_tzs, received_tzs, provider_ref, evidence_path, verified_by, verified_at, review_note, created_at')
    .eq('order_id', orderId)
    .order('created_at')
  if (error) throw new Error(`listPayments failed: ${error.message}`)
  return (data as PaymentRow[]) ?? []
}

/**
 * Record a payment attempt. Never verified at creation: a payment only counts
 * once `state = 'verified'` AND `verified_by` is set, which is either the
 * Selcom webhook after a confirmed server-side read, or a named Finance
 * officer. That single rule closes L1 (fake Lipa Namba reference) and L2
 * (spoofed webhook).
 */
export async function recordPaymentAttempt(input: {
  orderId: string
  purpose: PaymentPurpose
  channel: PaymentChannel
  expectedTzs: number
  state: 'initiated' | 'pending_review'
  providerRef?: string | null
  idempotencyKey?: string | null
  evidencePath?: string | null
}): Promise<PaymentRow | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('order_payments')
    .insert({
      order_id: input.orderId,
      purpose: input.purpose,
      channel: input.channel,
      state: input.state,
      expected_tzs: input.expectedTzs,
      provider_ref: input.providerRef ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      evidence_path: input.evidencePath ?? null,
    })
    .select('*')
    .single()
  if (error) {
    // A replayed webhook or a re-submitted reference. Already recorded, so
    // this is a no-op rather than an error.
    if ((error as { code?: string }).code === '23505') return null
    throw new Error(`recordPaymentAttempt failed: ${error.message}`)
  }
  return data as PaymentRow
}

/**
 * Mark a payment verified and advance the order if the relevant gate now opens.
 *
 * The two "short" branches are the important ones. An underpayment is the
 * common real-world case, not an error: the money is credited, the order stays
 * exactly where it is, and the customer is told what remains. Modelling it as
 * a failure would generate an Ops ticket for something that resolves itself in
 * ten minutes.
 */
export async function verifyPaymentAndAdvance(input: {
  paymentId: string
  receivedTzs: number
  /** 'selcom_webhook' or the verifying employee's id. */
  verifiedBy: string
  actorType: 'system' | 'finance'
  actorId?: string | null
  reviewNote?: string | null
}): Promise<{ order: CardOrderRow; moved: boolean; shortfall: number }> {
  const supabase = createSupabaseServerClient()

  const { data: payment, error: payErr } = await supabase
    .from('order_payments')
    .update({
      state: 'verified',
      received_tzs: input.receivedTzs,
      verified_by: input.verifiedBy,
      verified_at: new Date().toISOString(),
      review_note: input.reviewNote ?? null,
    })
    .eq('id', input.paymentId)
    // Only an unresolved payment may be verified, so a replay cannot
    // double-credit an order.
    .in('state', ['initiated', 'pending_review'])
    .select('*')
    .single()
  if (payErr) throw new Error(`verifyPayment failed: ${payErr.message}`)

  const p = payment as PaymentRow
  const order = await getOrderById(p.order_id)
  if (!order) throw new Error(`verifyPayment: order ${p.order_id} vanished`)
  const ledger = await getLedger(p.order_id)
  if (!ledger) throw new Error(`verifyPayment: no ledger for ${p.order_id}`)

  const isDeposit = p.purpose === 'deposit'
  const gateOpen = isDeposit
    ? ledger.depositPaidTzs >= Math.min(ledger.depositDueTzs, Math.max(ledger.effectiveTotalTzs, 0))
    : ledger.outstandingTzs <= 0

  const shortfall = isDeposit
    ? Math.max(Math.min(ledger.depositDueTzs, Math.max(ledger.effectiveTotalTzs, 0)) - ledger.depositPaidTzs, 0)
    : Math.max(ledger.outstandingTzs, 0)

  // Where the order goes depends on where it is, not on what was paid: a
  // deposit arriving against an order already in the balance phase is simply
  // credited.
  const target: CardOrderStatus | null = gateOpen
    ? order.status === 'awaiting_deposit' || order.status === 'deposit_review'
      ? 'deposit_paid'
      : order.status === 'awaiting_balance' ||
          order.status === 'balance_review' ||
          order.status === 'balance_overdue' ||
          order.status === 'forfeited'
        ? 'settled'
        : null
    : order.status === 'awaiting_deposit'
      ? 'awaiting_deposit' // self-loop: credit and notify the shortfall
      : order.status === 'awaiting_balance'
        ? 'awaiting_balance'
        : null

  if (!target) return { order, moved: false, shortfall }

  const updated = await transitionOrder({
    orderId: order.id,
    to: target,
    eventType: gateOpen
      ? isDeposit
        ? input.actorType === 'finance' ? 'deposit.approved' : 'deposit.verified'
        : 'balance.settled'
      : 'payment.short',
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    payload: {
      payment_id: p.id,
      received_tzs: input.receivedTzs,
      shortfall_tzs: shortfall,
      outstanding_tzs: Math.max(ledger.outstandingTzs, 0),
    },
  })

  // Settlement releases the asset. Attempted inline so paying and receiving
  // feel like ONE action — any perceptible gap between the two is where
  // support tickets come from (TDD §5.3).
  //
  // Deliberately best-effort: a verified payment is durable and must NEVER be
  // rolled back because a downstream publish failed (TDD §10). If this throws,
  // the order stays `settled` and the sweeper's delivery pass retries until it
  // succeeds. Dynamic import keeps orders.ts and publish.ts from forming a
  // cycle at module load.
  if (updated.status === 'settled' && updated.event_id) {
    try {
      const { publishSettledOrder } = await import('./publish')
      const published = await publishSettledOrder(updated.id)
      if (published.ok) {
        const fresh = await getOrderById(updated.id)
        return { order: fresh ?? updated, moved: true, shortfall }
      }
      console.error('[commission] publish deferred to sweeper:', published.message)
    } catch (error) {
      console.error('[commission] publish threw; sweeper will retry', error)
    }
  }

  return { order: updated, moved: target !== order.status, shortfall }
}

/** Reject a Lipa Namba submission. A note is mandatory — see the route. */
export async function rejectPayment(input: {
  paymentId: string
  verifiedBy: string
  actorId: string
  note: string
}): Promise<CardOrderRow> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('order_payments')
    .update({
      state: 'rejected',
      verified_by: input.verifiedBy,
      verified_at: new Date().toISOString(),
      review_note: input.note,
    })
    .eq('id', input.paymentId)
    .eq('state', 'pending_review')
    .select('*')
    .single()
  if (error) throw new Error(`rejectPayment failed: ${error.message}`)

  const p = data as PaymentRow
  const order = await getOrderById(p.order_id)
  if (!order) throw new Error(`rejectPayment: order ${p.order_id} vanished`)

  const target: CardOrderStatus =
    order.status === 'balance_review' ? 'balance_rejected' : 'deposit_rejected'

  return transitionOrder({
    orderId: order.id,
    to: target,
    eventType: 'payment.rejected',
    actorType: 'finance',
    actorId: input.actorId,
    payload: { payment_id: p.id, note: input.note },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
//  Timeline
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineEvent = {
  id: number
  from_status: CardOrderStatus | null
  to_status: CardOrderStatus | null
  event_type: string
  actor_type: string
  payload: Record<string, unknown>
  created_at: string
}

/**
 * The order's timeline, filtered by audience. `visible_to` is applied here
 * rather than in the UI so an internal QA note or a policy exception cannot
 * leak into a customer-facing render by accident.
 */
export async function getTimeline(
  orderId: string,
  audience: 'customer' | 'designer' | 'admin',
): Promise<TimelineEvent[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('order_events')
    .select('id, from_status, to_status, event_type, actor_type, payload, created_at')
    .eq('order_id', orderId)
    .contains('visible_to', [audience])
    .order('created_at')
  if (error) throw new Error(`getTimeline failed: ${error.message}`)
  return (data as TimelineEvent[]) ?? []
}
