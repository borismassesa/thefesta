import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { withinRateLimit } from '@/lib/checkin/rate-limit'
import {
  checkoutIdempotencyKey,
  clientIp,
  validateCheckout,
} from '@/lib/commission/checkout'
import {
  createCommissionOrder,
  getLedger,
  recordPaymentAttempt,
  type CardOrderRow,
} from '@/lib/commission/orders'
import { issueClaimToken } from '@/lib/commission/claim-tokens'
import {
  createOrder as selcomCreateOrder,
  extractGatewayUrl,
  isSelcomConfigured,
  normalizeMsisdn,
  walletPush,
} from '@/lib/payments/selcom'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/commission/checkout — the ONLY unauthenticated write path in the
 * Custom Card Commission Service.
 * Specs: OP-CCS-PRD-001 §7.1, §7.2.1; OP-CCS-TDD-001 §7.2, §8.
 *
 * The buyer is never blocked by "select your event" (P1). Someone with no
 * account and no event can pay here and be reconciled to the right event
 * later, with zero data loss, via the claim link this route issues.
 *
 * Everything financial is derived server-side. The request body carries a
 * package id, never a price.
 */

// Per PRD/TDD: 5 per hour per IP and per phone. Two separate buckets, because
// a shared office NAT and a single determined buyer are different problems.
const MAX_PER_HOUR = 5
const HOUR = 3600

type CheckoutResponse = {
  orderNo: string
  orderId: string
  status: string
  totalTzs: number
  depositDueTzs: number
  outstandingTzs: number
  /** Card method only — the Selcom hosted-checkout URL to redirect to. */
  redirectUrl?: string
  /** Lipa Namba only — what to show the buyer so they can pay manually. */
  lipaNamba?: { merchantNumber: string; reference: string }
  /** The buyer's link back into this order while they have no account. */
  claimUrl: string
  message?: string
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_OPUS_PASS_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://opuspass.opusfesta.com'
  )
}

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = validateCheckout(await req.json().catch(() => null))
  if (!parsed.ok) {
    return NextResponse.json({ field: parsed.field, message: parsed.message }, { status: 400 })
  }
  const input = parsed.value

  const supabase = createSupabaseServerClient()
  const ip = clientIp(req)
  const [ipOk, phoneOk] = await Promise.all([
    withinRateLimit(supabase, `ccs:checkout:ip:${ip}`, MAX_PER_HOUR, HOUR),
    withinRateLimit(supabase, `ccs:checkout:phone:${input.buyerPhone}`, MAX_PER_HOUR, HOUR),
  ])
  if (!ipOk || !phoneOk) {
    return NextResponse.json(
      { message: 'Too many attempts — wait a few minutes and try again.' },
      { status: 429 },
    )
  }

  // ── Create the order ──────────────────────────────────────────────────────
  // Price, deposit percent and deposit due are all read from card_packages
  // inside createCommissionOrder. An inactive package throws here, which is
  // what stops a sale at the placeholder prices the catalogue ships with.
  let order: CardOrderRow
  let reused = false
  try {
    const created = await createCommissionOrder({
      buyerName: input.buyerName,
      buyerPhone: input.buyerPhone,
      buyerEmail: input.buyerEmail,
      locale: input.locale,
      packageId: input.packageId,
      categoryId: input.categoryId,
      provisionalEventName: input.provisionalEventName,
      provisionalEventDate: input.provisionalEventDate,
      // Anonymous checkout: identity is bound at claim time, never guessed here.
      userId: null,
      eventId: null,
      idempotencyKey: checkoutIdempotencyKey(input),
    })
    order = created.order
    reused = created.reused
  } catch (error) {
    console.error('[commission] checkout could not create the order', error)
    return NextResponse.json(
      { message: 'That package is not available right now. Please try another, or contact us.' },
      { status: 409 },
    )
  }

  const ledger = await getLedger(order.id)
  const claim = await issueClaimToken(order.id, order.buyer_phone)
  const claimUrl = `${baseUrl()}/commission/${order.order_no}?t=${claim.token}`

  const response: CheckoutResponse = {
    orderNo: order.order_no,
    orderId: order.id,
    status: order.status,
    totalTzs: order.total_tzs,
    depositDueTzs: order.deposit_due_tzs,
    outstandingTzs: ledger?.outstandingTzs ?? order.total_tzs,
    claimUrl,
  }

  // A double-tap resolved to the original order. Return it as a success —
  // from the buyer's side their tap worked, and an error would make them tap
  // again (loophole L12).
  if (reused) {
    return NextResponse.json({ ...response, message: 'This order already exists.' })
  }

  // ── Gate 1 payment ────────────────────────────────────────────────────────
  if (input.method === 'lipa_namba') {
    // Manual path. The order enters deposit_review only once the buyer submits
    // a reference (a separate route); here we just tell them where to pay.
    const merchantNumber = process.env.LIPA_NAMBA_MERCHANT_NUMBER
    if (!merchantNumber) {
      console.error('[commission] LIPA_NAMBA_MERCHANT_NUMBER is not configured')
      return NextResponse.json(
        { message: 'Manual payment is unavailable right now. Please pay by mobile money or card.' },
        { status: 503 },
      )
    }
    return NextResponse.json({
      ...response,
      lipaNamba: { merchantNumber, reference: order.order_no },
    })
  }

  if (!isSelcomConfigured()) {
    console.error('[commission] Selcom is not configured')
    return NextResponse.json(
      { message: 'Card and mobile payments are unavailable right now. Please use Lipa Namba.' },
      { status: 503 },
    )
  }

  // The payment row is written BEFORE the provider call, in 'initiated'. If the
  // Selcom call then fails we have a record of the attempt rather than a silent
  // gap, and the webhook has something to match against if it arrives anyway.
  const payment = await recordPaymentAttempt({
    orderId: order.id,
    purpose: 'deposit',
    channel: input.method === 'card' ? 'selcom_card' : 'selcom_mobile',
    expectedTzs: order.deposit_due_tzs,
    state: 'initiated',
    providerRef: null,
  })

  try {
    const selcomOrder = await selcomCreateOrder({
      orderRef: order.order_no,
      amount: order.deposit_due_tzs,
      currency: order.currency,
      buyerName: order.buyer_name,
      // Selcom requires an email; use a routable no-reply when the buyer chose
      // not to give one rather than failing a legitimate checkout.
      buyerEmail: order.buyer_email ?? 'no-reply@opusfesta.com',
      buyerPhone: order.buyer_phone,
      redirectUrl: `${baseUrl()}/commission/${order.order_no}?t=${claim.token}`,
      cancelUrl: `${baseUrl()}/commission/${order.order_no}?t=${claim.token}&cancelled=1`,
      webhookUrl: `${baseUrl()}/api/commission/webhooks/selcom`,
    })

    if (input.method === 'card') {
      const redirectUrl = extractGatewayUrl(selcomOrder)
      if (!redirectUrl) {
        console.error('[commission] Selcom returned no gateway URL', selcomOrder)
        return NextResponse.json(
          { ...response, message: 'Could not open the card payment page. Please try mobile money.' },
          { status: 502 },
        )
      }
      return NextResponse.json({ ...response, redirectUrl })
    }

    // Mobile money: this is what makes the PIN prompt appear on the phone.
    const transid = `${order.order_no}-D1`
    const push = await walletPush({
      orderRef: order.order_no,
      msisdn: normalizeMsisdn(order.buyer_phone),
      transid,
    })
    if (payment) {
      await createSupabaseServerClient()
        .from('order_payments')
        .update({ provider_ref: transid, raw_payload: push as never })
        .eq('id', payment.id)
    }
    return NextResponse.json({
      ...response,
      message: 'Check your phone and enter your PIN to confirm.',
    })
  } catch (error) {
    console.error('[commission] Selcom initiate failed', error)
    // The order still exists and is still payable — by Lipa Namba, or by
    // retrying. Losing the order because the gateway hiccuped would be worse
    // than returning it with a warning.
    return NextResponse.json(
      { ...response, message: 'We could not start that payment. Please try again, or use Lipa Namba.' },
      { status: 502 },
    )
  }
}
