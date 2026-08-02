import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { withinRateLimit } from '@/lib/checkin/rate-limit'
import { authorizeOrderAccess } from '@/lib/commission/access'
import { clientIp } from '@/lib/commission/checkout'
import {
  getLedger,
  recordPaymentAttempt,
  transitionOrder,
  TransitionError,
} from '@/lib/commission/orders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/commission/orders/:key/lipa-namba — submit a manual payment
 * reference, for EITHER gate.
 * Specs: OP-CCS-PRD-001 §7.2.1, §7.2.4; OP-CCS-TDD-001 §5.2; loophole L1.
 *
 * The buyer paid our merchant number by hand and is now telling us the
 * transaction id. This route deliberately does NOT credit anything: it records
 * a claim in `pending_review` and moves the order into the Finance queue. Money
 * only exists once a named Finance officer matches the reference against the
 * merchant statement — that single rule is what stops a made-up reference
 * buying free design work.
 *
 * The gate is derived from the ORDER's current state, not from anything the
 * client says, so one route serves both instalments.
 */

const MAX_SUBMISSIONS_PER_HOUR = 6

export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params
  const url = new URL(req.url)
  const token = url.searchParams.get('t')

  const access = await authorizeOrderAccess(key, token)
  if (!access.ok) {
    return NextResponse.json({ message: access.message }, { status: access.status })
  }
  const { order } = access

  const supabase = createSupabaseServerClient()
  const allowed = await withinRateLimit(
    supabase,
    `ccs:lipa:${order.id}:${clientIp(req)}`,
    MAX_SUBMISSIONS_PER_HOUR,
    3600,
  )
  if (!allowed) {
    return NextResponse.json(
      { message: 'Too many submissions — wait a few minutes and try again.' },
      { status: 429 },
    )
  }

  const body = (await req.json().catch(() => null)) as {
    reference?: unknown
    evidencePath?: unknown
  } | null
  const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''

  // Mobile-money confirmation codes are short alphanumeric strings. Rejecting
  // an obviously-wrong value here saves the buyer a round trip through a human.
  if (!/^[A-Za-z0-9._-]{6,40}$/.test(reference)) {
    return NextResponse.json(
      {
        field: 'reference',
        message: 'Enter the transaction ID from your payment confirmation message.',
      },
      { status: 400 },
    )
  }
  const evidencePath =
    typeof body?.evidencePath === 'string' && body.evidencePath.startsWith('commission/')
      ? body.evidencePath
      : null

  // Which gate are we at? Anything from approval onward is the balance.
  const depositStates = ['awaiting_deposit', 'deposit_rejected', 'deposit_review'] as const
  const balanceStates = [
    'awaiting_balance',
    'balance_rejected',
    'balance_review',
    'balance_overdue',
    'forfeited',
  ] as const

  const isDeposit = (depositStates as readonly string[]).includes(order.status)
  const isBalance = (balanceStates as readonly string[]).includes(order.status)
  if (!isDeposit && !isBalance) {
    return NextResponse.json(
      { message: 'There is no payment due on this order right now.' },
      { status: 409 },
    )
  }

  const ledger = await getLedger(order.id)
  // What we are ASKING for. The amount that actually arrived is whatever
  // Finance reads off the statement — they can differ, and that is expected.
  const expected = isDeposit
    ? Math.max(
        Math.min(ledger?.depositDueTzs ?? order.deposit_due_tzs, ledger?.effectiveTotalTzs ?? order.total_tzs) -
          (ledger?.depositPaidTzs ?? 0),
        0,
      )
    : Math.max(ledger?.outstandingTzs ?? order.total_tzs, 0)

  const payment = await recordPaymentAttempt({
    orderId: order.id,
    purpose: isDeposit ? 'deposit' : 'balance',
    channel: 'lipa_namba',
    expectedTzs: expected,
    state: 'pending_review',
    providerRef: reference,
    // The reference is globally unique across payments, so re-submitting the
    // same one is a no-op rather than a second queue entry.
    idempotencyKey: `lipa:${reference}`,
    evidencePath,
  })

  if (!payment) {
    return NextResponse.json({
      status: order.status,
      message: 'We already have that reference and are checking it.',
    })
  }

  // Move into the Finance queue. Already-in-review is not an error: the buyer
  // may be adding a second reference for a top-up payment.
  const target = isDeposit ? 'deposit_review' : 'balance_review'
  let status: string = order.status
  if (order.status !== target) {
    try {
      const updated = await transitionOrder({
        orderId: order.id,
        to: target,
        eventType: 'payment.submitted',
        actorType: 'customer',
        actorId: access.userId,
        payload: { payment_id: payment.id, reference, expected_tzs: expected },
      })
      status = updated.status
    } catch (error) {
      if (error instanceof TransitionError) {
        // The payment record stands regardless — losing a real submission
        // because the state moved underneath us would be far worse than an
        // order sitting one step behind. Finance still sees it in the queue.
        console.error('[commission] lipa-namba transition refused', error.message)
      } else {
        throw error
      }
    }
  }

  return NextResponse.json({
    status,
    expectedTzs: expected,
    message: 'Thank you. We are checking your payment and will confirm shortly.',
  })
}
