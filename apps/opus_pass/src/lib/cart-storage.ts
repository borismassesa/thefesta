'use client'

import type { Treatment } from '@/components/guests/InvitationVisual'
import { parseTemplateCardItemId, type TemplateCardType } from '@/lib/dashboard/pledge-card-templates'
import type { FulfillmentStatus } from '@/lib/payments/types'

const CONTACT_KEY = 'opuspass.contact.v1'
const ORDER_KEY = 'opuspass.lastOrder.v1'
const ORDERS_KEY = 'opuspass.orders.v1'
const ORDERS_MAX = 50

export type DeliveryMode = 'digital' | 'print'

export type StoredContact = {
  mode: DeliveryMode
  fullName: string
  email: string
  phone: string
  city?: string
  streetLine?: string
  notes?: string
}

/**
 * A purchased add-on, kept structured instead of only as a display string.
 *
 * `addOns: string[]` renders the label a customer saw ("25 premium printed
 * cards") and stays for that. But it is display copy: the CMS title drifts
 * (the 'paper-prints' add-on has been "Paper prints" and "Premium printed
 * cards"), so the quantity a designer or printer needs cannot be recovered
 * from it reliably. `code` is the stable CMS add-on id.
 */
export type StoredOrderAddOn = {
  /** Stable CMS add-on id, e.g. 'paper-prints' or 'door-scan'. */
  code: string
  /** Title at the time of purchase — frozen, so a later CMS rename can't rewrite history. */
  label: string
  /** Units bought. Always 1 for flat-fee add-ons. */
  qty: number
  /** Line amount in TZS. */
  amount: number
}

export type StoredOrderItem = {
  id: string
  name: string
  summary: string
  total: number
  /** Selected card's hero image — rendered as the confirmation thumbnail. */
  image?: string
  /** Visual treatment — fallback thumbnail when the card has no image. */
  treatment?: Treatment
  /** Structured fields so the confirmation row mirrors the cart line item. */
  tier?: string
  tierId?: string
  guests?: number
  /** TZS per guest actually charged — lets the invoice show the rate behind the
   *  line total. Absent on orders placed before priceOrder recorded it. */
  pricePerGuest?: number
  addOns?: string[]
  /** Structured form of `addOns`. Absent on orders placed before this shipped. */
  addOnItems?: StoredOrderAddOn[]
}

export type StoredOrderContact = {
  name?: string
  email: string
  phone: string
}

/** Structured payment details — rendered as label/value rows on the invoice. */
export type StoredOrderPayment = {
  /** Provider name, e.g. 'M-Pesa', 'Airtel Money', 'Card'. */
  provider: string
  /** OpusFesta's Lipa Namba the customer paid to. */
  businessNumber?: string
  /** Payer's mobile number (kept for support/verification, not shown on the invoice). */
  payerPhone?: string
  /** Account holder name the payment came from — as registered with the mobile network. */
  payerName?: string
  /** Last four digits of the card, for card payments. */
  cardLast4?: string
  /** Transaction confirmation code from the payer's M-Pesa/network SMS. */
  reference?: string
}

export type StoredOrder = {
  ref: string
  paidAt: string
  /** Dashboard event this order is linked to, when applicable. */
  eventId?: string | null
  /** Wedding/event date (ISO), when known — surfaced on the invoice. */
  eventDate?: string
  paymentLabel?: string
  /** Structured payment details for the invoice; paymentLabel remains the legacy fallback. */
  payment?: StoredOrderPayment
  /** Transaction confirmation code from the payer's M-Pesa/network SMS. */
  paymentRef?: string
  /**
   * Lipa Namba payments start as 'verifying' — the OpusFesta team has to
   * confirm the transaction before the order counts as paid.
   */
  paymentStatus?: 'verifying' | 'paid'
  /** Design-fulfillment progress once paid — set by the admin team. Only
   *  populated on orders fetched server-side (see orderRowToStoredOrder in
   *  lib/payments/orders.ts); a locally-built optimistic snapshot won't have
   *  it yet, which currentStageIndex() treats the same as 'not_started'. */
  fulfillmentStatus?: FulfillmentStatus
  /**
   * Which document this payload renders as.
   *
   * 'quotation' is a priced offer for a cart that has NOT been paid for and has
   * no order behind it — the thing a couple sends to whoever actually pays (a
   * parent, a sponsor, a company finance desk). It must never claim money was
   * received, so every "paid" assertion in invoice-pdf.tsx branches on this.
   * Absent means 'invoice', so every existing payload is unaffected.
   */
  documentKind?: 'invoice' | 'quotation'
  /** 'topup' = extra digital cards bought against an order that was already
   *  designed and released. Shown as its own line under that parent rather than
   *  as a separate purchase, because it produced no new card. */
  orderKind?: 'purchase' | 'topup'
  /** For a top-up: the ref of the purchase it was added to, so the orders list
   *  can group them without a second lookup. */
  parentRef?: string | null
  contact: StoredOrderContact
  items: StoredOrderItem[]
  subtotal: number
  discount: number
  total: number
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or private mode — ignore */
  }
}

export function getContact(): StoredContact | null {
  return read<StoredContact>(CONTACT_KEY)
}

export function setContact(contact: StoredContact): void {
  write(CONTACT_KEY, contact)
}

export function getLastOrder(): StoredOrder | null {
  return read<StoredOrder>(ORDER_KEY)
}

function sanitizeOrderForStorage(order: StoredOrder): StoredOrder {
  return {
    ref: order.ref,
    paidAt: order.paidAt,
    eventDate: order.eventDate,
    paymentLabel: order.paymentLabel,
    payment: order.payment,
    paymentRef: order.paymentRef,
    paymentStatus: order.paymentStatus,
    contact: order.contact,
    items: order.items,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
  }
}

export function setLastOrder(order: StoredOrder): void {
  const clean = sanitizeOrderForStorage(order)
  write(ORDER_KEY, clean)
  // Maintain a newest-first order history (deduped by ref, capped).
  const history = getOrders().filter((o) => o.ref !== clean.ref)
  write(ORDERS_KEY, [clean, ...history].slice(0, ORDERS_MAX))
}

/** All past orders, newest first. */
export function getOrders(): StoredOrder[] {
  return read<StoredOrder[]>(ORDERS_KEY) ?? []
}

export function getOrder(ref: string): StoredOrder | undefined {
  return getOrders().find((o) => o.ref === ref)
}

/**
 * Template-card purchases (pledge/thank-you) whose order is still
 * `paymentStatus: 'verifying'` — awaiting finance approval. There's no
 * server-side query for this (only paid orders are re-derived server-side,
 * see getPurchasedTemplateIds in dashboard/queries.ts), so the "under
 * review" badge on the card grid relies on this device's local order
 * history instead.
 */
export function getPendingTemplateIds(type: TemplateCardType, eventId?: string | null): Set<string> {
  const ids = new Set<string>()
  if (!eventId) return ids
  for (const order of getOrders()) {
    if (order.paymentStatus !== 'verifying') continue
    if (order.eventId !== eventId) continue
    for (const item of order.items) {
      const parsed = parseTemplateCardItemId(item.id)
      if (parsed && parsed.type === type) ids.add(parsed.templateId)
    }
  }
  return ids
}

/** How long a quotation holds its prices. Tier prices are CMS-editable, so a
 *  quote with no expiry is an open-ended promise the catalogue can't keep.
 *  Change this and the PDF follows, but the cart's `quote_hint` CMS string
 *  spells the number out in words — update that too. */
export const QUOTE_VALID_DAYS = 3

const QUOTE_KEY = 'of_quote_ref'

/**
 * The quotation number for the cart as it currently stands.
 *
 * Deliberately NOT the order-ref format: nothing is ordered, and a support
 * agent handed a `OF-2026-…` that matches no row would go looking for a lost
 * order. `QT-` says what it is.
 *
 * Stable while the cart is: re-downloading the same selection returns the same
 * number, because a finance desk holding two PDFs with different numbers for
 * one quote has no way to tell they are the same offer. Change the cart and the
 * number changes with it, which is correct — it is a different offer.
 */
export function getOrCreateQuoteRef(signature: string): string {
  const stored = read<{ signature: string; ref: string }>(QUOTE_KEY)
  if (stored && stored.signature === signature && stored.ref) return stored.ref
  const ref = generateQuoteRef()
  write(QUOTE_KEY, { signature, ref })
  return ref
}

function generateQuoteRef(): string {
  if (typeof crypto === 'undefined' || !crypto.randomUUID) {
    throw new Error('Web Crypto API not available — cannot generate a quotation reference')
  }
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
  return `QT-${new Date().getFullYear()}-${token}`
}

export function generateOrderRef(): string {
  if (typeof crypto === 'undefined' || !crypto.randomUUID) {
    throw new Error('Web Crypto API not available — cannot generate secure order reference')
  }
  const stamp = new Date()
  const yyyy = stamp.getFullYear()
  const uuid = crypto.randomUUID()
  const token = uuid.replace(/-/g, '').slice(0, 6).toUpperCase()
  return `OF-${yyyy}-${token}`
}
