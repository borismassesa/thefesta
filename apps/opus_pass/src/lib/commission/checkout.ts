import 'server-only'
import { createHash } from 'node:crypto'
import { normalizeMsisdn } from '@/lib/payments/selcom'

/**
 * Checkout input validation and idempotency for the commission service.
 *
 * Hand-rolled rather than Zod: neither Next app declares zod as a direct
 * dependency (it is only present as a hoisted transitive of @opusfesta/lib),
 * and adding one means regenerating the lockfile, which has previously stripped
 * platform binaries and broken the Vercel Linux build. The payload here is
 * eight fields; explicit checks are just as rigorous and carry no such risk.
 *
 * The one rule that matters: this module validates SHAPE only. It never
 * computes or accepts a price. Amounts come from `card_packages`, server-side,
 * every time (loophole L13).
 */

export type CheckoutInput = {
  buyerName: string
  buyerPhone: string
  buyerEmail: string | null
  locale: 'en' | 'sw'
  packageId: string
  categoryId: string
  method: 'mobile' | 'card' | 'lipa_namba'
  provisionalEventName: string | null
  provisionalEventDate: string | null
  /** Present only when a signed-in buyer picked one of their existing events. */
  eventId: string | null
}

export type ValidationResult =
  | { ok: true; value: CheckoutInput }
  | { ok: false; field: string; message: string }

const ID_PATTERN = /^[a-z0-9_]{2,40}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Deliberately loose: an over-strict email regex rejects real addresses, and
// email is optional here anyway — the phone is the identity anchor.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function validateCheckout(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, field: 'body', message: 'Invalid request.' }
  }
  const b = body as Record<string, unknown>

  const buyerName = str(b.buyerName)
  if (buyerName.length < 2 || buyerName.length > 120) {
    return { ok: false, field: 'buyerName', message: 'Enter the name this order is for.' }
  }

  // Phone is REQUIRED and is the real identity anchor in this market: it is
  // what the claim link is bound to, what Lipa Namba is reconciled against,
  // and what Ops calls when the balance goes overdue.
  const rawPhone = str(b.buyerPhone)
  const msisdn = normalizeMsisdn(rawPhone)
  if (!/^255[67]\d{8}$/.test(msisdn)) {
    return {
      ok: false,
      field: 'buyerPhone',
      message: 'Enter a valid Tanzanian mobile number, e.g. 0712 345 678.',
    }
  }
  const buyerPhone = `+${msisdn}`

  const rawEmail = str(b.buyerEmail)
  if (rawEmail && !EMAIL_PATTERN.test(rawEmail)) {
    return { ok: false, field: 'buyerEmail', message: 'That email address does not look right.' }
  }

  const locale = b.locale === 'en' ? 'en' : 'sw'

  const packageId = str(b.packageId)
  if (!ID_PATTERN.test(packageId)) {
    return { ok: false, field: 'packageId', message: 'Choose a package.' }
  }
  const categoryId = str(b.categoryId)
  if (!ID_PATTERN.test(categoryId)) {
    return { ok: false, field: 'categoryId', message: 'Choose the kind of card you need.' }
  }

  const method = str(b.method)
  if (method !== 'mobile' && method !== 'card' && method !== 'lipa_namba') {
    return { ok: false, field: 'method', message: 'Choose how you would like to pay.' }
  }

  const provisionalEventName = str(b.provisionalEventName) || null
  if (provisionalEventName && provisionalEventName.length > 120) {
    return { ok: false, field: 'provisionalEventName', message: 'That event name is too long.' }
  }

  // The event date drives the balance-chase cadence, so an unparseable one is
  // worth rejecting rather than silently dropping.
  let provisionalEventDate: string | null = null
  const rawDate = str(b.provisionalEventDate)
  if (rawDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(Date.parse(rawDate))) {
      return { ok: false, field: 'provisionalEventDate', message: 'Enter the event date as YYYY-MM-DD.' }
    }
    provisionalEventDate = rawDate
  }

  const rawEventId = str(b.eventId)
  if (rawEventId && !UUID_PATTERN.test(rawEventId)) {
    return { ok: false, field: 'eventId', message: 'That event could not be found.' }
  }

  return {
    ok: true,
    value: {
      buyerName,
      buyerPhone,
      buyerEmail: rawEmail || null,
      locale,
      packageId,
      categoryId,
      method: method as CheckoutInput['method'],
      provisionalEventName,
      provisionalEventDate,
      eventId: rawEventId || null,
    },
  }
}

/**
 * Idempotency key for order creation: phone + package + a 10-minute bucket.
 *
 * Loophole L12 is "duplicate orders from double-tapping pay". A 10-minute
 * window is wide enough to absorb a frustrated buyer tapping repeatedly on a
 * slow connection, and narrow enough that someone genuinely commissioning a
 * second card of the same package half an hour later is not blocked.
 */
export const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000

export function checkoutIdempotencyKey(input: {
  buyerPhone: string
  packageId: string
  categoryId: string
  now?: number
}): string {
  const bucket = Math.floor((input.now ?? Date.now()) / IDEMPOTENCY_WINDOW_MS)
  return createHash('sha256')
    .update(`ccs:${input.buyerPhone}:${input.packageId}:${input.categoryId}:${bucket}`)
    .digest('hex')
}

/** First hop of x-forwarded-for — the client, on Vercel. */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
