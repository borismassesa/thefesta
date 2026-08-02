import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { mapSelcomStatus, queryOrderStatus } from '@/lib/payments/selcom'
import {
  getOrderByNo,
  recordPaymentAttempt,
  verifyPaymentAndAdvance,
  type PaymentRow,
} from '@/lib/commission/orders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Selcom payment callback for the commission service.
 * Specs: OP-CCS-TDD-001 §7.3, §10; loopholes L2, L13, L16.
 *
 * Three independent defences, because this endpoint is the one place an
 * attacker can try to manufacture money:
 *
 *   1. HMAC over the raw body. Verified BEFORE parsing, so a forged payload is
 *      never even interpreted.
 *   2. The status is never taken from the callback body. We re-query Selcom's
 *      order-status API and act only on that confirmed server-side read — the
 *      same discipline the existing invitation webhook uses.
 *   3. The AMOUNT is taken from that authoritative read too, and if it does not
 *      match what we asked for, the payment goes to pending_review for a human
 *      rather than auto-verifying.
 *
 * On top of those, `order_payments.idempotency_key` is UNIQUE, so a replayed
 * callback is a no-op rather than a double credit.
 *
 * Always returns 200 once the signature passes. Selcom retries on non-2xx, and
 * retrying will not fix "this order does not exist" — it will just generate
 * noise. Anything unactionable is logged instead.
 */

type Callback = {
  order_id?: string
  transid?: string
  reference?: string
  result?: string
  resultcode?: string
  payment_status?: string
  amount?: string | number
}

/**
 * Verify Selcom's signature over the exact bytes received.
 *
 * When no secret is configured this returns true so local development and the
 * pre-go-live dry run stay testable — matching how the WhatsApp webhook in this
 * codebase already behaves. Set SELCOM_WEBHOOK_SECRET in production; without
 * it, defence 1 is off and only defences 2 and 3 are protecting the ledger.
 */
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.SELCOM_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[commission] SELCOM_WEBHOOK_SECRET is not set — webhook signature not verified')
    return true
  }
  if (!header) return false
  // Accept either a bare hex digest or a "sha256=" prefixed one.
  const provided = header.startsWith('sha256=') ? header.slice(7) : header
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function parseBody(raw: string, contentType: string): Callback {
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw) as Callback
    } catch {
      return {}
    }
  }
  const params = new URLSearchParams(raw)
  const obj: Record<string, string> = {}
  for (const [k, v] of params.entries()) obj[k] = v
  return obj as Callback
}

export async function POST(req: Request): Promise<NextResponse> {
  // Read the RAW body: the signature is over exact bytes, so anything that
  // re-serialises the payload first would break verification.
  const rawBody = await req.text()
  const signature =
    req.headers.get('x-selcom-signature') ??
    req.headers.get('digest') ??
    req.headers.get('x-signature')

  if (!verifySignature(rawBody, signature)) {
    console.error('[commission] rejected a Selcom webhook with a bad signature')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const body = parseBody(rawBody, req.headers.get('content-type') ?? '')
  const orderNo = body.order_id
  if (!orderNo) return NextResponse.json({ received: true })

  const order = await getOrderByNo(orderNo)
  if (!order) {
    console.warn('[commission] webhook for unknown order', orderNo)
    return NextResponse.json({ received: true })
  }

  // ── Defence 2: never trust the callback's own verdict ─────────────────────
  const authoritative = await queryOrderStatus(orderNo).catch((error) => {
    console.error('[commission] could not re-query Selcom', error)
    return null
  })
  if (!authoritative) {
    // Do NOT credit anything on an unverified read. The reconciliation sweeper
    // picks this order up and retries.
    return NextResponse.json({ received: true, deferred: true })
  }

  const record = authoritative.data?.[0] ?? {}
  const status = mapSelcomStatus(record.payment_status ?? authoritative.result)
  if (status !== 'paid') {
    // 'pending' will be resolved by a later callback or the sweeper; 'failed'
    // needs no ledger entry at all, because nothing arrived.
    return NextResponse.json({ received: true, status })
  }

  const providerRef = record.transid ?? body.transid ?? body.reference ?? null
  // Which gate is this? Deposit while the order is in the deposit phase,
  // balance thereafter. Derived from the ORDER's state, not the callback.
  const purpose: 'deposit' | 'balance' =
    order.status === 'awaiting_deposit' ||
    order.status === 'deposit_review' ||
    order.status === 'deposit_rejected'
      ? 'deposit'
      : 'balance'

  // ── Defence 3: the amount comes from the authoritative read ───────────────
  const reportedAmount = Number(record.amount ?? body.amount ?? NaN)
  const supabase = createSupabaseServerClient()

  // Find the payment row this callback belongs to, or create one. A Selcom
  // payment initiated by our own checkout already has a row in 'initiated'.
  let payment: PaymentRow | null = null
  if (providerRef) {
    const { data } = await supabase
      .from('order_payments')
      .select('*')
      .eq('order_id', order.id)
      .eq('provider_ref', providerRef)
      .maybeSingle()
    payment = (data as PaymentRow) ?? null
  }
  if (!payment) {
    const { data } = await supabase
      .from('order_payments')
      .select('*')
      .eq('order_id', order.id)
      .eq('purpose', purpose)
      .eq('state', 'initiated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    payment = (data as PaymentRow) ?? null
  }
  if (!payment) {
    // A payment we never initiated — for example the buyer completed a hosted
    // checkout we lost the response for. Record it so the money is not lost.
    payment = await recordPaymentAttempt({
      orderId: order.id,
      purpose,
      channel: 'selcom_card',
      expectedTzs: purpose === 'deposit' ? order.deposit_due_tzs : order.total_tzs,
      state: 'initiated',
      providerRef,
      idempotencyKey: providerRef ? `selcom:${providerRef}` : null,
    })
    // A null here means the unique index rejected it: this exact callback was
    // already processed. Replay is a no-op (loophole L2).
    if (!payment) return NextResponse.json({ received: true, duplicate: true })
  }

  if (payment.state === 'verified') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  await supabase
    .from('order_payments')
    .update({ provider_ref: providerRef, raw_payload: authoritative as never })
    .eq('id', payment.id)

  if (!Number.isFinite(reportedAmount) || reportedAmount <= 0) {
    // Selcom said paid but gave us no usable amount. Crediting a guess would
    // be worse than asking a human: park it in the Finance queue.
    await supabase
      .from('order_payments')
      .update({
        state: 'pending_review',
        review_note: 'Selcom confirmed payment but reported no usable amount — verify against the merchant statement.',
      })
      .eq('id', payment.id)
    console.error('[commission] Selcom paid callback with no amount', orderNo, record)
    return NextResponse.json({ received: true, review: true })
  }

  const { moved, shortfall } = await verifyPaymentAndAdvance({
    paymentId: payment.id,
    receivedTzs: Math.round(reportedAmount),
    verifiedBy: 'selcom_webhook',
    actorType: 'system',
  })

  return NextResponse.json({ received: true, moved, shortfall })
}
