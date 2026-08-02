import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { authorizeOrderAccess } from '@/lib/commission/access'
import { getLedger, recordPaymentAttempt } from '@/lib/commission/orders'
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
 * Pay the balance via Selcom (Gate 2).
 * Specs: OP-CCS-PRD-001 §7.2.2; OP-CCS-TDD-001 §5.3.
 *
 * "Approve and pay must feel like one action, and the file must appear
 * immediately on settlement. Any perceptible gap between paying and receiving
 * is where support tickets come from."
 *
 * The amount is ALWAYS the live outstanding figure read from the ledger at the
 * moment of payment — never a number the client sends, and never a figure
 * cached from when the invoice was raised. Between approval and payment the
 * total can legitimately move: a revision top-up may have been accepted, or
 * Ops may have applied a discount.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params
  const url = new URL(req.url)
  const token = url.searchParams.get('t')

  const access = await authorizeOrderAccess(key, token)
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status })
  const order = access.order

  const payable = ['awaiting_balance', 'balance_rejected', 'balance_overdue', 'forfeited']
  if (!payable.includes(order.status)) {
    return NextResponse.json(
      { message: 'There is no balance due on this order right now.' },
      { status: 409 },
    )
  }

  const ledger = await getLedger(order.id)
  const outstanding = Math.max(ledger?.outstandingTzs ?? 0, 0)
  if (outstanding <= 0) {
    return NextResponse.json({ message: 'This order is already paid in full.' }, { status: 409 })
  }

  if (!isSelcomConfigured()) {
    return NextResponse.json(
      { message: 'Card and mobile payments are unavailable right now. Please use Lipa Namba.' },
      { status: 503 },
    )
  }

  const body = (await req.json().catch(() => null)) as { method?: unknown; phone?: unknown } | null
  const method = body?.method === 'card' ? 'card' : 'mobile'
  const phone = typeof body?.phone === 'string' && body.phone ? body.phone : order.buyer_phone

  const payment = await recordPaymentAttempt({
    orderId: order.id,
    purpose: 'balance',
    channel: method === 'card' ? 'selcom_card' : 'selcom_mobile',
    expectedTzs: outstanding,
    state: 'initiated',
  })

  const base =
    process.env.NEXT_PUBLIC_OPUS_PASS_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://opuspass.opusfesta.com'
  const back = `${base}/commission/${order.order_no}${token ? `?t=${encodeURIComponent(token)}` : ''}`

  try {
    // A distinct provider reference per instalment. Reusing the deposit's
    // order_id would make the two payments indistinguishable in Selcom's
    // reporting and break reconciliation.
    const selcomRef = `${order.order_no}-B`
    const created = await selcomCreateOrder({
      orderRef: selcomRef,
      amount: outstanding,
      currency: order.currency,
      buyerName: order.buyer_name,
      buyerEmail: order.buyer_email ?? 'no-reply@opusfesta.com',
      buyerPhone: phone,
      redirectUrl: back,
      cancelUrl: `${back}${token ? '&' : '?'}cancelled=1`,
      webhookUrl: `${base}/api/commission/webhooks/selcom`,
    })

    if (method === 'card') {
      const redirectUrl = extractGatewayUrl(created)
      if (!redirectUrl) {
        return NextResponse.json(
          { message: 'Could not open the card payment page. Please try mobile money.' },
          { status: 502 },
        )
      }
      if (payment) {
        await createSupabaseServerClient()
          .from('order_payments')
          .update({ provider_ref: selcomRef })
          .eq('id', payment.id)
      }
      return NextResponse.json({ outstandingTzs: outstanding, redirectUrl })
    }

    const transid = `${order.order_no}-B1`
    await walletPush({
      orderRef: selcomRef,
      msisdn: normalizeMsisdn(phone),
      transid,
    })
    if (payment) {
      await createSupabaseServerClient()
        .from('order_payments')
        .update({ provider_ref: transid })
        .eq('id', payment.id)
    }
    return NextResponse.json({
      outstandingTzs: outstanding,
      message: 'Check your phone and enter your PIN to confirm.',
    })
  } catch (error) {
    console.error('[commission] balance payment initiate failed', error)
    return NextResponse.json(
      { message: 'We could not start that payment. Please try again, or use Lipa Namba.' },
      { status: 502 },
    )
  }
}
