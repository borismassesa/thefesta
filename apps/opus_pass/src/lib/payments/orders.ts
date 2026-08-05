import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { StoredOrder } from '@/lib/cart-storage'
import type { FulfillmentStatus, InitiateItem, OrderStatus } from './types'
import { isTerminal } from './types'
import { deriveOrderCategory, type OrderCategory } from './order-category'

// Data-access layer for invitation_orders / invitation_payment_events. All
// reads/writes go through the service-role client (RLS denies everyone else).

export type OrderRow = {
  id: string
  ref: string
  user_id: string | null
  status: OrderStatus
  currency: string
  subtotal: number
  discount: number
  amount_total: number
  contact_name: string | null
  contact_email: string
  contact_phone: string
  event_date: string | null
  event_id: string | null
  items: InitiateItem[]
  provider: string
  payment_method: string | null
  payer_phone: string | null
  payer_name: string | null
  payment_reference: string | null
  provider_order_id: string | null
  payment_label: string | null
  payment_submitted_at: string | null
  paid_at: string | null
  fulfillment_status: FulfillmentStatus
  fulfillment_updated_at: string | null
  fulfillment_updated_by: string | null
  receipt_emailed_at: string | null
  purchase_notified_at: string | null
  /** 'invitation' (default) or 'product' — product orders ride the same ledger. */
  kind: string
  /** Product family this order belongs to (digital_card, gift_registry, …) —
   *  what the admin Payments console segments by. See order-category.ts. */
  category: OrderCategory
  /** Guest delivery details for product orders. */
  delivery: Record<string, unknown> | null
  /** Set once finalize_product_order has run its once-only side effects. */
  product_finalized_at: string | null
  /** 'purchase' (a card was bought and designed) or 'topup' (extra capacity on
   *  a parent order's already-released card). See migration 20260804180000. */
  order_kind: 'purchase' | 'topup'
  /** Top-up only: the original purchase this inherits card/event/price from. */
  parent_order_id: string | null
  /** Top-up only: the exact frozen release the extra guests will receive. */
  topup_release_id: string | null
  /** Top-up only: TZS per guest actually charged, frozen at purchase. */
  topup_unit_price: number | null
  created_at: string
}

export const ORDER_SELECT_COLS =
  'id, ref, user_id, status, currency, subtotal, discount, amount_total, contact_name, contact_email, contact_phone, event_date, event_id, items, provider, payment_method, payer_phone, payer_name, payment_reference, provider_order_id, payment_label, payment_submitted_at, paid_at, fulfillment_status, fulfillment_updated_at, fulfillment_updated_by, receipt_emailed_at, purchase_notified_at, kind, category, delivery, product_finalized_at, order_kind, parent_order_id, topup_release_id, topup_unit_price, created_at'
const SELECT_COLS = ORDER_SELECT_COLS

export async function createPendingOrder(input: {
  ref: string
  userId?: string | null
  currency: string
  subtotal: number
  discount: number
  amountTotal: number
  contact: { name?: string; email: string; phone: string }
  eventDate?: string | null
  eventId?: string | null
  items: InitiateItem[]
  status?: OrderStatus
  provider?: string
  paymentMethod: 'mobile' | 'card' | 'lipa_namba'
  payerPhone?: string | null
  payerName?: string | null
  paymentReference?: string | null
  paymentLabel?: string | null
  paymentSubmittedAt?: string | null
  kind?: 'invitation' | 'product'
  /** Product family — defaults to a value derived from kind + item ids so no
   *  order is ever left uncategorized. Pass explicitly only when the flow knows
   *  better than the derivation (e.g. the future attire/rings checkout). */
  category?: OrderCategory
  delivery?: Record<string, unknown> | null
  /** Top-up fields. All four move together — the DB enforces that a top-up
   *  carries a parent, a release and a unit price, and that a purchase carries
   *  none of them (invitation_orders_topup_shape). */
  orderKind?: 'purchase' | 'topup'
  parentOrderId?: string | null
  topupReleaseId?: string | null
  topupUnitPrice?: number | null
  /** Per-user key that makes a repeated initiate call a no-op. When the key has
   *  already been used, the existing order is returned instead of a new one. */
  idempotencyKey?: string | null
}): Promise<OrderRow> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('invitation_orders')
    .insert({
      ref: input.ref,
      user_id: input.userId ?? null,
      status: input.status ?? 'pending',
      currency: input.currency,
      subtotal: input.subtotal,
      discount: input.discount,
      amount_total: input.amountTotal,
      contact_name: input.contact.name ?? null,
      contact_email: input.contact.email,
      contact_phone: input.contact.phone,
      event_date: input.eventDate ?? null,
      event_id: input.eventId ?? null,
      items: input.items,
      provider: input.provider ?? 'selcom',
      payment_method: input.paymentMethod,
      payer_phone: input.payerPhone ?? null,
      payer_name: input.payerName ?? null,
      payment_reference: input.paymentReference ?? null,
      payment_label: input.paymentLabel ?? null,
      payment_submitted_at: input.paymentSubmittedAt ?? null,
      kind: input.kind ?? 'invitation',
      category: input.category ?? deriveOrderCategory(input.kind ?? 'invitation', input.items),
      delivery: input.delivery ?? null,
      order_kind: input.orderKind ?? 'purchase',
      parent_order_id: input.parentOrderId ?? null,
      topup_release_id: input.topupReleaseId ?? null,
      topup_unit_price: input.topupUnitPrice ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select(SELECT_COLS)
    .single()
  if (error) {
    // 23505 on the per-user idempotency index = this exact intent already
    // became an order (a refresh, a double tap, a retry after a timeout).
    // Returning that order is the correct response, not an error: the caller
    // then reports the real status of the payment already in flight.
    if ((error as { code?: string }).code === '23505' && input.idempotencyKey && input.userId) {
      const existing = await findOrderByIdempotencyKey(input.userId, input.idempotencyKey)
      if (existing) return existing
    }
    throw new Error(`createPendingOrder failed: ${error.message}`)
  }
  return data as OrderRow
}

/** The order a previous initiate call with this key already created, if any. */
export async function findOrderByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<OrderRow | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('invitation_orders')
    .select(SELECT_COLS)
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (error) throw new Error(`findOrderByIdempotencyKey failed: ${error.message}`)
  return (data as OrderRow) ?? null
}

export async function getOrderByRef(ref: string): Promise<OrderRow | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('invitation_orders')
    .select(SELECT_COLS)
    .eq('ref', ref)
    .maybeSingle()
  if (error) throw new Error(`getOrderByRef failed: ${error.message}`)
  return (data as OrderRow) ?? null
}

// Map a server OrderRow into the StoredOrder shape the invoice PDF renders from.
// paymentStatus reflects the order's current stage (paid → "PAID", else
// "PAYMENT VERIFYING"). Shared by the email sender and the /api/invoice route.
export function orderRowToStoredOrder(
  order: OrderRow,
  /** Ref of this order's parent, when it is a top-up. Resolved by the caller
   *  (see getOrdersForUser) because the row itself only carries the parent's id
   *  and the orders list needs a human-readable ref to group by. */
  parentRef?: string | null,
): StoredOrder {
  return {
    ref: order.ref,
    orderKind: order.order_kind,
    parentRef: parentRef ?? null,
    paidAt: order.paid_at ?? order.payment_submitted_at ?? order.created_at,
    eventId: order.event_id,
    eventDate: order.event_date ?? undefined,
    paymentLabel: order.payment_label ?? undefined,
    payment: {
      provider: order.payment_label || 'M-Pesa Lipa Namba',
      payerName: order.payer_name ?? undefined,
      payerPhone: order.payer_phone ?? undefined,
      reference: order.payment_reference ?? undefined,
    },
    paymentRef: order.payment_reference ?? undefined,
    paymentStatus: order.status === 'paid' ? 'paid' : 'verifying',
    fulfillmentStatus: order.fulfillment_status,
    contact: {
      name: order.contact_name ?? undefined,
      email: order.contact_email,
      phone: order.contact_phone,
    },
    items: order.items.map((i) => ({
      id: i.id,
      name: i.name,
      image: i.image,
      summary: i.summary ?? '',
      total: i.total,
      tier: i.tier,
      tierId: i.tierId,
      guests: i.guests,
      addOns: i.addOns,
      addOnItems: i.addOnItems,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.amount_total,
  }
}

/**
 * Every order still relevant to the couple's Orders dashboard — paid ones
 * plus payments genuinely in flight (pending/processing). Deliberately
 * excludes failed/expired/refunded: orderRowToStoredOrder only distinguishes
 * 'paid' vs 'verifying', so a dead/abandoned checkout would otherwise render
 * as an indefinite, misleading "payment under review" and get re-polled on
 * every visit. Matches by user_id first; email/phone are only consulted for
 * guest-checkout rows (user_id IS NULL), mirroring
 * fetchPaidOrdersForCouple in lib/dashboard/queries.ts.
 */
export async function getOrdersForUser(
  userId: string,
  email: string | null | undefined,
  whatsappPhone: string | null,
): Promise<OrderRow[]> {
  const supabase = createSupabaseServerClient()
  const guestCheckoutOrs: string[] = []
  if (email) guestCheckoutOrs.push(`and(user_id.is.null,contact_email.eq.${email})`)
  if (whatsappPhone) guestCheckoutOrs.push(`and(user_id.is.null,contact_phone.eq.${whatsappPhone})`)
  const ors = [`user_id.eq.${userId}`, ...guestCheckoutOrs]

  const { data, error } = await supabase
    .from('invitation_orders')
    .select(SELECT_COLS)
    .in('status', ['pending', 'processing', 'paid'])
    .or(ors.join(','))
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getOrdersForUser failed: ${error.message}`)
  return (data as OrderRow[]) ?? []
}

/**
 * Every order for the couple's dashboard, with each top-up carrying the ref of
 * the purchase it belongs to.
 *
 * The parent is looked up separately rather than embedded: `parent_order_id`
 * is a self-referencing FK, and the embed syntax for those depends on the
 * constraint name, which is exactly the kind of thing that breaks silently on
 * a later migration. A second read of at most a handful of ids is cheaper than
 * that risk.
 */
export async function getOrdersForDashboardUser(
  userId: string,
  email: string | null | undefined,
  whatsappPhone: string | null,
): Promise<StoredOrder[]> {
  const rows = await getOrdersForUser(userId, email, whatsappPhone)

  const parentIds = [...new Set(rows.map((r) => r.parent_order_id).filter((id): id is string => Boolean(id)))]
  const refById = new Map<string, string>()
  if (parentIds.length > 0) {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase.from('invitation_orders').select('id, ref').in('id', parentIds)
    for (const row of (data ?? []) as { id: string; ref: string }[]) refById.set(row.id, row.ref)
  }

  return rows.map((row) =>
    orderRowToStoredOrder(row, row.parent_order_id ? refById.get(row.parent_order_id) ?? null : null),
  )
}

export async function setProviderOrderId(ref: string, providerOrderId: string): Promise<void> {
  const supabase = createSupabaseServerClient()
  await supabase
    .from('invitation_orders')
    .update({ provider_order_id: providerOrderId })
    .eq('ref', ref)
}

export async function markManualPaymentEmails(
  ref: string,
  flags: { customerSent: boolean; adminSent: boolean },
): Promise<void> {
  const patch: Record<string, string> = {}
  const now = new Date().toISOString()
  if (flags.customerSent) patch.customer_invoice_emailed_at = now
  if (flags.adminSent) patch.admin_notified_at = now
  if (Object.keys(patch).length === 0) return

  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('invitation_orders').update(patch).eq('ref', ref)
  if (error) console.error('[payments] could not mark manual payment emails', error)
}

/**
 * Transition an order to a new status. Refuses to move OUT of a terminal state
 * (so a late duplicate webhook can't flip a `paid` order to `failed`, or vice
 * versa). Returns the resulting status.
 */
export async function transitionOrder(
  ref: string,
  next: OrderStatus,
): Promise<OrderStatus> {
  const supabase = createSupabaseServerClient()
  const current = await getOrderByRef(ref)
  if (!current) throw new Error(`transitionOrder: order ${ref} not found`)
  if (isTerminal(current.status)) return current.status // locked — no-op

  const patch: Record<string, unknown> = { status: next }
  if (next === 'paid') patch.paid_at = new Date().toISOString()
  // Guard the UPDATE itself against terminal states so the read-then-write is
  // atomic: if a concurrent webhook/poll already moved the row to a terminal
  // state, this update matches zero rows rather than overwriting it (e.g. a
  // late 'failed' callback must not un-pay an already-'paid' order).
  const { data, error } = await supabase
    .from('invitation_orders')
    .update(patch)
    .eq('ref', ref)
    .not('status', 'in', '(paid,failed,expired,refunded)')
    .select('status')
  if (error) throw new Error(`transitionOrder failed: ${error.message}`)
  if (!data || data.length === 0) {
    // Lost the race — report whatever terminal state actually won.
    const latest = await getOrderByRef(ref)
    return latest?.status ?? current.status
  }

  // This call genuinely just flipped the order to a terminal state (current
  // was non-terminal, and the guarded UPDATE matched a row) — run the
  // once-only side effects for that state, by order kind. Lipa Namba product
  // orders finalize via the admin approval path instead (which writes
  // status='paid' directly), but the finalize RPC is idempotent so a Selcom
  // product order finalizing here is equally safe.
  if (next === 'paid') {
    // A top-up inherits a release a human already approved, so payment is the
    // only thing standing between it and being sendable. Mirrors the finance
    // approval path in opus_admin — a gateway-confirmed top-up must not sit at
    // 'not_started' waiting for design work that will never be created.
    if (current.order_kind === 'topup') {
      await supabase
        .from('invitation_orders')
        .update({ fulfillment_status: 'ready', fulfillment_updated_at: new Date().toISOString() })
        .eq('ref', ref)
    }
    if (current.kind === 'product') {
      const { finalizeProductOrder } = await import('./product-orders')
      await finalizeProductOrder(ref)
    } else {
      await notifyOrderPaid(ref)
    }
  } else if ((next === 'failed' || next === 'expired') && current.kind === 'product') {
    const { releaseProductOrder } = await import('./product-orders')
    await releaseProductOrder(ref)
  }

  return next
}

/** Best-effort, single-fire "order paid" side effects. A send failure must
 *  never surface to the payment-confirmation caller (webhook/status poll). */
async function notifyOrderPaid(ref: string): Promise<void> {
  try {
    const order = await getOrderByRef(ref)
    if (!order || order.receipt_emailed_at) return // already notified — defensive belt

    const { sendOrderPaidReceipt, sendAdminNewPurchaseEmail } = await import('./email')
    const [customer, admin] = await Promise.all([
      sendOrderPaidReceipt(order),
      sendAdminNewPurchaseEmail(order),
    ])

    const patch: Record<string, string> = {}
    if (customer.sent) patch.receipt_emailed_at = new Date().toISOString()
    if (admin.sent) patch.purchase_notified_at = new Date().toISOString()
    if (Object.keys(patch).length > 0) {
      const supabase = createSupabaseServerClient()
      await supabase.from('invitation_orders').update(patch).eq('ref', ref)
    }
  } catch (error) {
    console.error('[payments] notifyOrderPaid failed', error)
  }
}

/**
 * Append a provider callback to the audit log. Idempotent: a duplicate
 * `providerEventId` is silently ignored (unique-violation → already processed).
 * Returns true when this was a NEW event (caller should act on it).
 */
export async function recordPaymentEvent(input: {
  orderId: string
  providerEventId?: string | null
  status?: OrderStatus | null
  rawPayload: unknown
}): Promise<boolean> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('invitation_payment_events').insert({
    order_id: input.orderId,
    provider_event_id: input.providerEventId ?? null,
    status: input.status ?? null,
    raw_payload: input.rawPayload as never,
  })
  if (error) {
    // 23505 = unique_violation → this exact event was already recorded.
    if ((error as { code?: string }).code === '23505') return false
    throw new Error(`recordPaymentEvent failed: ${error.message}`)
  }
  return true
}
