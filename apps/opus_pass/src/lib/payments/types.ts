import type { Treatment } from '@/components/guests/InvitationVisual'

// Shared payment types — safe to import from both client and server (no
// 'server-only' or node deps here). Mirrors the DB enum in the
// 20260613000001_invitation_orders migration.

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refunded'

/** Terminal states — no further transition is expected. */
export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'paid',
  'failed',
  'expired',
  'refunded',
])

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

/** Design-fulfillment progress once an order is paid. Independent of
 *  OrderStatus — a payment can be 'paid' while fulfillment is still
 *  'not_started'. Mirrors the DB enum in the
 *  20260716000001_invitation_orders_fulfillment_receipts migration. */
export type FulfillmentStatus = 'not_started' | 'in_progress' | 'ready' | 'delivered'

export type PaymentMethod = 'mobile' | 'card' | 'lipa_namba'

/** One cart line as sent from the browser to /api/payments/initiate. */
export type InitiateItem = {
  id: string
  name: string
  /** Selected card's hero image — persisted so admin/email/dashboard can render it. */
  image?: string
  /** Visual treatment — fallback thumbnail when the card has no hero image. */
  treatment?: Treatment
  summary?: string
  tier?: string
  tierId?: string
  guests?: number
  /** Per-guest tier price (TZS) the client used — re-verified against the CMS. */
  pricePerGuest?: number
  /** Non-guest-scaling extras already folded into `total` (prints, swag, etc.). */
  extrasTotal?: number
  addOns?: string[]
  /** Client-computed line total (TZS) — re-derived server-side, never trusted.
   *  Ignored when `kind` names a flat-price product (see `kind`). */
  total: number
  /** Marks a non-invitation flat-price line so priceOrder() re-prices it
   *  authoritatively instead of trusting the client or guest-tier math:
   *  'template_unlock' (a pledge/thank-you card unlock) or 'product' (a real
   *  vendor product from the registry shop, priced from products.price_tzs). */
  kind?: 'template_unlock' | 'product'
  // ── Product-line fields (kind === 'product') ──────────────────────────────
  /** The products.id being bought. */
  productId?: string
  /** How many units. Price = products.price_tzs × quantity (server-authoritative). */
  quantity?: number
  /** When the buyer is fulfilling a gift already on the couple's registry,
   *  the gift_registry_items.id — links the purchase to that gift so it's
   *  marked reserved/purchased. Absent for a surprise shop gift. */
  registryItemId?: string
}

export type InitiateContact = {
  name?: string
  email: string
  phone: string
}

export type InitiateRequest = {
  method: PaymentMethod
  /** msisdn that should receive the M-Pesa push (mobile method only). */
  phone?: string
  /** Manual Lipa Namba account holder name as entered by the customer. */
  payerName?: string
  /** Manual Lipa Namba transaction confirmation code/reference. */
  paymentReference?: string
  contact: InitiateContact
  items: InitiateItem[]
  eventDate?: string
  /** Which of the couple's wedding_events this order's design/quota is for. */
  eventId?: string
  /** For a product/registry purchase: the couple's public registry slug
   *  (wedding_events.gift_registry_slug) the gifts are being bought from. The
   *  server resolves the event + couple from this, never trusting the client. */
  registrySlug?: string
  /** Guest delivery details for a product order. */
  delivery?: {
    name?: string
    phone?: string
    region?: string
    city?: string
    address?: string
    notes?: string
  }
  /** Label persisted for the invoice, e.g. "M-Pesa +255…". */
  paymentLabel?: string
  /** Where Selcom returns the buyer after a card payment. Defaults to the
   *  invitation-checkout confirmation page when omitted. */
  redirectPath?: string
  /** Where Selcom sends the buyer if they cancel a card payment. Defaults to
   *  the invitation checkout page when omitted. */
  cancelPath?: string
}

/** Response from /api/payments/initiate. */
export type InitiateResponse = {
  ref: string
  status: OrderStatus
  /** For the card method — the Selcom hosted-checkout URL to redirect to. */
  redirectUrl?: string
  /** User-facing message when something is off (e.g. amount mismatch). */
  message?: string
}

/** Response from /api/payments/status?ref=… */
export type StatusResponse = {
  ref: string
  status: OrderStatus
  amountTotal: number
  currency: string
  paymentLabel?: string
  paidAt?: string
}
