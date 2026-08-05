import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { InitiateRequest, InitiateResponse } from '@/lib/payments/types'
import { priceOrder } from '@/lib/payments/pricing'
import { getDashboardUser } from '@/lib/dashboard/auth'
import { createNotification } from '@/lib/dashboard/notifications'
import { resolveOwnedEventId } from '@/lib/dashboard/queries'
import {
  createPendingOrder,
  findOrderByIdempotencyKey,
  markManualPaymentEmails,
  setProviderOrderId,
  transitionOrder,
} from '@/lib/payments/orders'
import { resolveTopup, topupOrderItem } from '@/lib/payments/topup'
import { sendManualPaymentSubmittedEmails } from '@/lib/payments/email'
import { createProductOrderLines, resolveRegistryContext } from '@/lib/payments/product-orders'
import {
  isSelcomConfigured,
  createOrder,
  walletPush,
  extractGatewayUrl,
  normalizeMsisdn,
} from '@/lib/payments/selcom'

// Payment calls must never be cached or statically optimised.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PHONE_RE = /^\+?(?:[\d](?:[\s().-]?)){9,}$/
const PAYREF_RE = /^[A-Za-z0-9.\-]{6,25}$/

function generateRef(): string {
  const year = new Date().getFullYear()
  const token = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
  return `OF-${year}-${token}`
}

function appOrigin(req: Request): string {
  // Prefer the configured public URL (the webhook must be publicly reachable);
  // fall back to the request origin for local dev.
  return (process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? new URL(req.url).origin).replace(/\/$/, '')
}

function formatTzs(value: number): string {
  return `TZS ${value.toLocaleString('en-US')}`
}

export async function POST(req: Request): Promise<NextResponse<InitiateResponse>> {
  let body: InitiateRequest
  try {
    body = (await req.json()) as InitiateRequest
  } catch {
    return NextResponse.json(
      { ref: '', status: 'failed', message: 'Invalid request.' },
      { status: 400 },
    )
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  const { method, contact, items } = body
  if (method !== 'mobile' && method !== 'card' && method !== 'lipa_namba') {
    return bad('Choose a payment method.')
  }
  // A top-up carries no cart: its single line is built server-side from the
  // parent order, so an empty `items` is correct rather than an empty cart.
  if (!body.topup && (!Array.isArray(items) || items.length === 0)) {
    return bad('Your cart is empty.')
  }
  if (!contact?.email || !contact?.phone) {
    return bad('Contact email and phone are required.')
  }
  if (method === 'mobile') {
    const phone = body.phone?.trim()
    if (!phone || !PHONE_RE.test(phone)) return bad('Enter a valid M-Pesa phone number.')
  }
  if (method === 'lipa_namba') {
    const phone = body.phone?.trim()
    if (!phone || !PHONE_RE.test(phone)) return bad('Enter the phone number used to pay.')
    if (!body.payerName?.trim() || body.payerName.trim().length < 3) {
      return bad('Enter the name on the account used to pay.')
    }
    if (!body.paymentReference?.trim() || !PAYREF_RE.test(body.paymentReference.trim())) {
      return bad('Enter the payment reference from your confirmation SMS.')
    }
  }

  // ── Top-up: extra capacity on a card the couple already owns ────────────────
  // Separated from the cart flow entirely. Nothing about what is bought comes
  // from the browser except "which released card" and "how many guests", and
  // both are re-validated against the parent order before a shilling is asked
  // for. Signed-in only: a top-up writes a child of an owned order, which is
  // not something a guest checkout can be allowed to do.
  if (body.topup) {
    const topupUser = await getDashboardUser().catch((error) => {
      console.error('[payments] dashboard user lookup failed', error)
      return null
    })
    if (!topupUser) return bad('Sign in to top up your invitations.')

    const idempotencyKey = body.idempotencyKey?.trim()
    if (!idempotencyKey) return bad('Could not submit this top-up. Refresh the page and try again.')

    // A repeat of an intent that already became an order. Answer with that
    // order rather than creating a second one — this is the refresh/retry path,
    // and it must be indistinguishable from the first call's outcome.
    const existing = await findOrderByIdempotencyKey(topupUser.id, idempotencyKey)
    if (existing) {
      return NextResponse.json({
        ref: existing.ref,
        status: existing.status,
        message:
          existing.status === 'processing'
            ? 'Payment submitted for review.'
            : undefined,
      })
    }

    const topupEventId = await resolveOwnedEventId(topupUser.id, body.eventId)
    if (!topupEventId) return bad('Choose which event these invitations are for.')

    const resolved = await resolveTopup({
      userId: topupUser.id,
      eventId: topupEventId,
      releaseId: body.topup.releaseId,
      guests: body.topup.guests,
    })
    if (!resolved.ok) return bad(resolved.message)

    const { candidate, guests, unitPrice, amount } = resolved
    const topupItem = topupOrderItem(candidate, guests, amount)
    const topupRef = generateRef()
    const origin = appOrigin(req)
    const topupPayerPhone =
      method === 'mobile' || method === 'lipa_namba' ? normalizeMsisdn(body.phone!.trim()) : null
    const topupOrderInput = {
      ref: topupRef,
      userId: topupUser.id,
      currency: 'TZS',
      subtotal: amount,
      discount: 0,
      amountTotal: amount,
      contact: { name: contact.name, email: contact.email, phone: contact.phone },
      eventId: topupEventId,
      items: [topupItem],
      payerPhone: topupPayerPhone,
      paymentLabel: body.paymentLabel ?? null,
      orderKind: 'topup' as const,
      parentOrderId: candidate.parentOrderId,
      topupReleaseId: candidate.releaseId,
      topupUnitPrice: unitPrice,
      idempotencyKey,
    }

    if (method === 'lipa_namba') {
      const payerName = body.payerName?.trim() ?? ''
      const paymentReference = body.paymentReference?.trim().toUpperCase() ?? ''
      const order = await createPendingOrder({
        ...topupOrderInput,
        status: 'processing',
        provider: 'mpesa_lipa_namba',
        paymentMethod: 'lipa_namba',
        payerName,
        paymentReference,
        paymentSubmittedAt: new Date().toISOString(),
      })
      const emailFlags = await sendManualPaymentSubmittedEmails(order)
      await Promise.all([
        markManualPaymentEmails(order.ref, emailFlags),
        createNotification({
          userId: topupUser.id,
          type: 'payment_submitted',
          title: 'Top-up submitted',
          body: `${guests} more invitations · ${formatTzs(amount)} is under finance review${paymentReference ? ` · ref ${paymentReference}` : ''}`,
          href: '/my/dashboard/orders',
        }),
      ])
      return NextResponse.json({
        ref: order.ref,
        status: order.status,
        message: 'Payment submitted for review.',
      })
    }

    if (!isSelcomConfigured()) {
      return NextResponse.json(
        { ref: '', status: 'failed', message: 'Card & mobile payments are not available yet. Choose Lipa Namba.' },
        { status: 503 },
      )
    }

    const order = await createPendingOrder({ ...topupOrderInput, paymentMethod: method })
    // The idempotency key already belonged to an order created between our
    // lookup and this insert — two submits racing. createPendingOrder returned
    // the winner; don't charge for it a second time.
    if (order.ref !== topupRef) {
      return NextResponse.json({ ref: order.ref, status: order.status })
    }

    try {
      const created = await createOrder({
        orderRef: topupRef,
        amount,
        currency: 'TZS',
        buyerName: contact.name ?? 'OpusPass customer',
        buyerEmail: contact.email,
        buyerPhone: contact.phone,
        redirectUrl: `${origin}/my/dashboard/invitations/top-up/confirmation?ref=${topupRef}`,
        // The top-up UI is a drawer over the send console, so a cancelled card
        // payment returns there rather than to a route of its own.
        cancelUrl: `${origin}/my/dashboard/invitations?event=${topupEventId}`,
        webhookUrl: `${origin}/api/payments/webhook`,
      })
      if (created.resultcode && created.resultcode !== '000') {
        await transitionOrder(topupRef, 'failed')
        return NextResponse.json({ ref: topupRef, status: 'failed', message: created.message ?? 'Could not start the payment.' }, { status: 502 })
      }
      if (method === 'card') {
        const redirectUrl = extractGatewayUrl(created)
        if (!redirectUrl) {
          await transitionOrder(topupRef, 'failed')
          return NextResponse.json({ ref: topupRef, status: 'failed', message: 'Card payment is unavailable right now.' }, { status: 502 })
        }
        return NextResponse.json({ ref: topupRef, status: 'pending', redirectUrl })
      }
      const transid = randomUUID().replace(/-/g, '').slice(0, 20)
      await setProviderOrderId(topupRef, transid)
      const push = await walletPush({ orderRef: topupRef, msisdn: topupPayerPhone!, transid })
      if (push.resultcode && push.resultcode !== '000') {
        await transitionOrder(topupRef, 'failed')
        return NextResponse.json({ ref: topupRef, status: 'failed', message: push.message ?? 'Could not send the payment prompt.' }, { status: 502 })
      }
      return NextResponse.json({ ref: topupRef, status: 'pending' })
    } catch (err) {
      console.error('[payments] top-up initiate failed', err)
      await transitionOrder(topupRef, 'failed').catch(() => {})
      return NextResponse.json({ ref: topupRef, status: 'failed', message: 'Payment could not be started. Please try again.' }, { status: 502 })
    }
  }

  // ── Authoritative amount (never trust the client's totals) ──────────────────
  const pricing = await priceOrder(items)
  if (pricing.amountTotal <= 0) return bad('Order total is invalid.')
  if (pricing.adjustments.length > 0) {
    console.warn('[payments] client totals adjusted to CMS prices', pricing.adjustments)
  }

  // ── Product / registry purchase ─────────────────────────────────────────────
  // Guests buying real vendor products from a couple's registry shop. Distinct
  // from the invitation flow: the buyer is an unauthenticated guest, the order
  // links to the couple via their registry slug, and it reserves the gift(s)
  // with pending_payment claims that finalize on paid / release on failure.
  if (items.some((i) => i.kind === 'product')) {
    if (!pricing.fullyTrusted) return bad('One of these products is no longer available.')
    // Registry purchase reserves a couple's gift; a plain shop purchase (no
    // registrySlug) just ships to the buyer. Either way the goods need an
    // address, so a delivery address is required for product orders.
    const ctx = body.registrySlug ? await resolveRegistryContext(body.registrySlug) : null
    if (body.registrySlug && !ctx) return bad('This registry link is no longer active.')
    if (!body.delivery?.address?.trim()) return bad('Enter a delivery address.')

    const ref = generateRef()
    const origin = appOrigin(req)
    const payerPhone =
      method === 'mobile' || method === 'lipa_namba' ? normalizeMsisdn(body.phone!.trim()) : null

    if (method === 'lipa_namba') {
      const order = await createPendingOrder({
        ref,
        userId: null,
        currency: pricing.currency,
        subtotal: pricing.subtotal,
        discount: pricing.discount,
        amountTotal: pricing.amountTotal,
        contact: { name: contact.name, email: contact.email, phone: contact.phone },
        eventId: ctx?.eventId ?? null,
        items: pricing.items,
        status: 'processing',
        provider: 'mpesa_lipa_namba',
        paymentMethod: 'lipa_namba',
        payerPhone,
        payerName: body.payerName?.trim() ?? '',
        paymentReference: body.paymentReference?.trim().toUpperCase() ?? '',
        paymentSubmittedAt: new Date().toISOString(),
        paymentLabel: body.paymentLabel ?? null,
        kind: 'product',
        delivery: body.delivery ?? null,
      })
      await createProductOrderLines(order, pricing.items, ctx)
      return NextResponse.json({ ref, status: 'processing', message: 'Payment submitted for review.' })
    }

    if (!isSelcomConfigured()) {
      return NextResponse.json(
        { ref: '', status: 'failed', message: 'Card & mobile payments are not available yet. Choose Lipa Namba.' },
        { status: 503 },
      )
    }

    const order = await createPendingOrder({
      ref,
      userId: null,
      currency: pricing.currency,
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      amountTotal: pricing.amountTotal,
      contact: { name: contact.name, email: contact.email, phone: contact.phone },
      eventId: ctx?.eventId ?? null,
      items: pricing.items,
      paymentMethod: method,
      payerPhone,
      paymentLabel: body.paymentLabel ?? null,
      kind: 'product',
      delivery: body.delivery ?? null,
    })
    await createProductOrderLines(order, pricing.items, ctx)

    try {
      const created = await createOrder({
        orderRef: ref,
        amount: pricing.amountTotal,
        currency: pricing.currency,
        buyerName: contact.name ?? 'OpusPass guest',
        buyerEmail: contact.email,
        buyerPhone: contact.phone,
        redirectUrl: `${origin}${body.redirectPath ?? `/gift-registry/${body.registrySlug}`}${(body.redirectPath ?? '').includes('?') ? '&' : '?'}purchase_ref=${ref}`,
        cancelUrl: `${origin}${body.cancelPath ?? `/gift-registry/${body.registrySlug}`}`,
        webhookUrl: `${origin}/api/payments/webhook`,
      })
      if (created.resultcode && created.resultcode !== '000') {
        await transitionOrder(ref, 'failed')
        return NextResponse.json({ ref, status: 'failed', message: created.message ?? 'Could not start the payment.' }, { status: 502 })
      }
      if (method === 'card') {
        const redirectUrl = extractGatewayUrl(created)
        if (!redirectUrl) {
          await transitionOrder(ref, 'failed')
          return NextResponse.json({ ref, status: 'failed', message: 'Card payment is unavailable right now.' }, { status: 502 })
        }
        return NextResponse.json({ ref, status: 'pending', redirectUrl })
      }
      const transid = randomUUID().replace(/-/g, '').slice(0, 20)
      await setProviderOrderId(ref, transid)
      const push = await walletPush({ orderRef: ref, msisdn: payerPhone!, transid })
      if (push.resultcode && push.resultcode !== '000') {
        await transitionOrder(ref, 'failed')
        return NextResponse.json({ ref, status: 'failed', message: push.message ?? 'Could not send the payment prompt.' }, { status: 502 })
      }
      return NextResponse.json({ ref, status: 'pending' })
    } catch (err) {
      console.error('[payments] product initiate failed', err)
      await transitionOrder(ref, 'failed').catch(() => {})
      return NextResponse.json({ ref, status: 'failed', message: 'Payment could not be started. Please try again.' }, { status: 502 })
    }
  }

  const ref = generateRef()
  const origin = appOrigin(req)
  const dashboardUser = await getDashboardUser().catch((error) => {
    console.error('[payments] dashboard user lookup failed', error)
    return null
  })
  const payerPhone = method === 'mobile' || method === 'lipa_namba'
    ? normalizeMsisdn(body.phone!.trim())
    : null
  // Re-verify the client-supplied eventId against this couple's own events —
  // never trust it directly (it would otherwise let an order reference a
  // wedding_events row that isn't the buyer's).
  const eventId = dashboardUser ? await resolveOwnedEventId(dashboardUser.id, body.eventId) : null

  if (method === 'lipa_namba') {
    const payerName = body.payerName?.trim() ?? ''
    const paymentReference = body.paymentReference?.trim().toUpperCase() ?? ''
    const order = await createPendingOrder({
      ref,
      userId: dashboardUser?.id ?? null,
      currency: pricing.currency,
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      amountTotal: pricing.amountTotal,
      contact: { name: contact.name, email: contact.email, phone: contact.phone },
      eventDate: body.eventDate ?? null,
      eventId,
      items: pricing.items,
      status: 'processing',
      provider: 'mpesa_lipa_namba',
      paymentMethod: 'lipa_namba',
      payerPhone,
      payerName,
      paymentReference,
      paymentSubmittedAt: new Date().toISOString(),
      paymentLabel: body.paymentLabel ?? null,
    })
    const emailFlags = await sendManualPaymentSubmittedEmails(order)
    await Promise.all([
      markManualPaymentEmails(ref, emailFlags),
      dashboardUser
        ? createNotification({
            userId: dashboardUser.id,
            type: 'payment_submitted',
            title: 'Invitation payment submitted',
            body: `${formatTzs(pricing.amountTotal)} is under finance review${paymentReference ? ` · ref ${paymentReference}` : ''}`,
            href: '/my/dashboard/orders',
          })
        : Promise.resolve(),
    ])
    return NextResponse.json({
      ref,
      status: 'processing',
      message: 'Payment submitted for review.',
    })
  }

  // Fail loudly when the automated gateway isn't wired up. Manual Lipa Namba is
  // handled above because the customer already paid externally.
  if (!isSelcomConfigured()) {
    return NextResponse.json(
      { ref: '', status: 'failed', message: 'Payments are not available right now. Please try again later.' },
      { status: 503 },
    )
  }

  // ── Persist as pending BEFORE talking to Selcom ─────────────────────────────
  await createPendingOrder({
    ref,
    userId: dashboardUser?.id ?? null,
    currency: pricing.currency,
    subtotal: pricing.subtotal,
    discount: pricing.discount,
    amountTotal: pricing.amountTotal,
    contact: { name: contact.name, email: contact.email, phone: contact.phone },
    eventDate: body.eventDate ?? null,
    eventId,
    items: pricing.items,
    paymentMethod: method,
    payerPhone,
    paymentLabel: body.paymentLabel ?? null,
  })

  // ── Create the Selcom order ─────────────────────────────────────────────────
  try {
    const created = await createOrder({
      orderRef: ref,
      amount: pricing.amountTotal,
      currency: pricing.currency,
      buyerName: contact.name ?? 'OpusPass customer',
      buyerEmail: contact.email,
      buyerPhone: contact.phone,
      // Card redirects the browser back via Selcom's hosted page, so this URL
      // must carry the ref itself (mobile/lipa_namba resolve client-side and
      // don't rely on this). `redirectPath` (when the caller overrides the
      // default invitation confirmation page) may or may not already have a
      // query string, so append `ref` with the right separator.
      redirectUrl: body.redirectPath
        ? `${origin}${body.redirectPath}${body.redirectPath.includes('?') ? '&' : '?'}purchase_ref=${ref}`
        : `${origin}/digital-cards/confirmation?ref=${ref}`,
      cancelUrl: `${origin}${body.cancelPath ?? '/digital-cards/checkout'}`,
      webhookUrl: `${origin}/api/payments/webhook`,
    })

    if (created.resultcode && created.resultcode !== '000') {
      await transitionOrder(ref, 'failed')
      return NextResponse.json(
        { ref, status: 'failed', message: created.message ?? 'Could not start the payment.' },
        { status: 502 },
      )
    }

    if (method === 'card') {
      const redirectUrl = extractGatewayUrl(created)
      if (!redirectUrl) {
        await transitionOrder(ref, 'failed')
        return NextResponse.json(
          { ref, status: 'failed', message: 'Card payment is unavailable right now.' },
          { status: 502 },
        )
      }
      return NextResponse.json({ ref, status: 'pending', redirectUrl })
    }

    // Mobile — fire the USSD push so the PIN prompt appears on the phone.
    const transid = randomUUID().replace(/-/g, '').slice(0, 20)
    await setProviderOrderId(ref, transid)
    const push = await walletPush({ orderRef: ref, msisdn: payerPhone!, transid })
    if (push.resultcode && push.resultcode !== '000') {
      await transitionOrder(ref, 'failed')
      return NextResponse.json(
        { ref, status: 'failed', message: push.message ?? 'Could not send the payment prompt.' },
        { status: 502 },
      )
    }
    return NextResponse.json({ ref, status: 'pending' })
  } catch (err) {
    console.error('[payments] initiate failed', err)
    await transitionOrder(ref, 'failed').catch(() => {})
    return NextResponse.json(
      { ref, status: 'failed', message: 'Payment could not be started. Please try again.' },
      { status: 502 },
    )
  }
}

function bad(message: string): NextResponse<InitiateResponse> {
  return NextResponse.json({ ref: '', status: 'failed', message }, { status: 400 })
}
