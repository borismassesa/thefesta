import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase'
import { toCategory, type PaymentCategory } from '../payments/queries'

export type FulfillmentStatus = 'not_started' | 'in_progress' | 'ready' | 'delivered'

export type FulfillmentOrder = {
  id: string
  ref: string
  status: string
  provider: string
  paymentMethod: string | null
  paymentLabel: string | null
  paymentReference: string | null
  category: PaymentCategory
  fulfillmentStatus: FulfillmentStatus
  fulfillmentUpdatedAt: string | null
  fulfillmentUpdatedBy: string | null
  amountTotal: number
  contactName: string | null
  contactEmail: string
  contactPhone: string
  items: FulfillmentOrderItem[]
  paidAt: string | null
  submittedAt: string | null
  createdAt: string
}

export type FulfillmentOrderItem = {
  id?: string
  name?: string
  image?: string
  summary?: string
  tier?: string
  tierId?: string
  guests?: number
  addOns?: string[]
  total?: number
}

type FulfillmentOrderRow = {
  id: string
  ref: string
  status: string
  provider: string
  category: string | null
  payment_method: string | null
  payment_label: string | null
  payment_reference: string | null
  payment_submitted_at: string | null
  fulfillment_status: FulfillmentStatus
  fulfillment_updated_at: string | null
  fulfillment_updated_by: string | null
  amount_total: string | number
  contact_name: string | null
  contact_email: string
  contact_phone: string
  items: unknown
  paid_at: string | null
  created_at: string
}

const COLUMNS = `
  id, ref, status, provider, category, payment_method, payment_label,
  payment_reference, payment_submitted_at,
  fulfillment_status, fulfillment_updated_at, fulfillment_updated_by,
  amount_total, contact_name, contact_email, contact_phone, items,
  paid_at, created_at
`

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  return out.length > 0 ? out : undefined
}

// `tierId` and `addOns` matter beyond display: the item pills only take the
// structured path when at least one of tier/guests/add-ons is present, and
// `tierId` picks the pill colour. Dropping them here would silently push every
// order onto the legacy "split the summary on ·" fallback.
function parseItems(value: unknown): FulfillmentOrderItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
      image: typeof item.image === 'string' ? item.image : undefined,
      summary: typeof item.summary === 'string' ? item.summary : undefined,
      tier: typeof item.tier === 'string' ? item.tier : undefined,
      tierId: typeof item.tierId === 'string' ? item.tierId : undefined,
      guests: typeof item.guests === 'number' ? item.guests : undefined,
      addOns: parseStringArray(item.addOns),
      total: typeof item.total === 'number' ? item.total : undefined,
    }))
}

function mapOrder(row: FulfillmentOrderRow): FulfillmentOrder {
  return {
    id: row.id,
    ref: row.ref,
    status: row.status,
    provider: row.provider,
    paymentMethod: row.payment_method,
    paymentLabel: row.payment_label,
    paymentReference: row.payment_reference,
    category: toCategory(row.category),
    fulfillmentStatus: row.fulfillment_status,
    fulfillmentUpdatedAt: row.fulfillment_updated_at,
    fulfillmentUpdatedBy: row.fulfillment_updated_by,
    amountTotal: Number(row.amount_total),
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    items: parseItems(row.items),
    paidAt: row.paid_at,
    submittedAt: row.payment_submitted_at,
    createdAt: row.created_at,
  }
}

export type FulfillmentFilter =
  | 'all'
  | 'awaiting_payment'
  | 'not_started'
  | 'in_progress'
  | 'ready'
  | 'delivered'

const FULFILLMENT_KEYS = ['not_started', 'in_progress', 'ready', 'delivered'] as const

function isFulfillmentKey(filter: FulfillmentFilter): filter is FulfillmentStatus {
  return (FULFILLMENT_KEYS as readonly string[]).includes(filter)
}

/**
 * The statuses this queue tracks. 'pending' is deliberately excluded: it is the
 * pre-redirect state of a Selcom checkout (opus_pass api/payments/initiate) and
 * nothing in the system ever expires it, so every abandoned checkout would sit
 * here forever and push real work past the page cap. 'processing' is written
 * only by the Lipa Namba branches and is exactly "payment under review".
 */
const OPEN_STATUSES = ['processing', 'paid'] as const

export const ORDERS_PAGE_SIZE = 50

/**
 * The design-fulfilment queue: digital-card orders that are either awaiting a
 * Lipa Namba approval or already paid and moving through design. Unlike
 * finance/payments (a payment-*verification* queue, Lipa-Namba-only by design
 * since card/mobile auto-confirm via Selcom), nothing here is approved or
 * rejected — an order under review is shown read-only with a link across to
 * that page. Registry/shop purchases (kind='product') are excluded because they
 * have no design to fulfil and would sit at 'not_started' forever.
 */
export async function getFulfillmentOrders(
  opts: { filter?: FulfillmentFilter; q?: string; limit?: number } = {},
): Promise<FulfillmentOrder[]> {
  const { filter = 'all', q, limit = ORDERS_PAGE_SIZE } = opts
  const supabase = createSupabaseAdminClient()
  let query = supabase.from('invitation_orders').select(COLUMNS).eq('kind', 'invitation')

  if (filter === 'awaiting_payment') query = query.eq('status', 'processing')
  else if (isFulfillmentKey(filter)) query = query.eq('status', 'paid').eq('fulfillment_status', filter)
  else query = query.in('status', OPEN_STATUSES)

  const term = (q ?? '').replace(/[^a-zA-Z0-9@.\-_ ]/g, '').trim()
  if (term) {
    query = query.or(
      [
        `ref.ilike.%${term}%`,
        `contact_name.ilike.%${term}%`,
        `contact_email.ilike.%${term}%`,
      ].join(','),
    )
  }

  // created_at only. Awaiting-payment rows have a NULL paid_at, so sorting by
  // paid_at first would push every one of them below the row cap — hiding
  // exactly the orders this queue exists to surface. created_at is also the
  // only indexed sort (idx_invitation_orders_created).
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)

  if (error) throw new Error(error.message)
  return ((data ?? []) as FulfillmentOrderRow[]).map(mapOrder)
}

/** Totals for the KPI tiles — independent of the current filter/search. */
export async function getFulfillmentSummary(): Promise<{
  awaitingPayment: number
  notStarted: number
  inProgress: number
  ready: number
  delivered: number
}> {
  const supabase = createSupabaseAdminClient()
  const base = () =>
    supabase.from('invitation_orders').select('id', { count: 'exact', head: true }).eq('kind', 'invitation')
  const paid = () => base().eq('status', 'paid')

  const [awaitingPayment, notStarted, inProgress, ready, delivered] = await Promise.all([
    base().eq('status', 'processing'),
    paid().eq('fulfillment_status', 'not_started'),
    paid().eq('fulfillment_status', 'in_progress'),
    paid().eq('fulfillment_status', 'ready'),
    paid().eq('fulfillment_status', 'delivered'),
  ])

  return {
    awaitingPayment: awaitingPayment.count ?? 0,
    notStarted: notStarted.count ?? 0,
    inProgress: inProgress.count ?? 0,
    ready: ready.count ?? 0,
    delivered: delivered.count ?? 0,
  }
}
