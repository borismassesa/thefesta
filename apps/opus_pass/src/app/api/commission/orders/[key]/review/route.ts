import { NextResponse } from 'next/server'
import { authorizeOrderAccess } from '@/lib/commission/access'
import {
  acceptTopup,
  getReviewableVersion,
  openRevisionRound,
  validateRevisionItems,
} from '@/lib/commission/review'
import { getLedger, transitionOrder, TransitionError } from '@/lib/commission/orders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * The customer's review decision.
 * Specs: OP-CCS-PRD-001 §7.6, §7.11.6; loopholes L6, L15, L19.
 *
 *   GET   the current watermarked preview (short-lived signed URL)
 *   POST  { action: 'approve' | 'request_changes' | 'accept_topup' }
 *
 * §7.11.6 makes "approval" a term with legal weight: it occurs only inside
 * OpusPass, through this endpoint, through payment of the balance in full, or
 * through the auto-approve timer. A WhatsApp "looks good" is explicitly NOT
 * approval — which is why there is no other route that can produce it.
 */

export async function GET(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params
  const token = new URL(req.url).searchParams.get('t')
  const access = await authorizeOrderAccess(key, token)
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status })

  const version = await getReviewableVersion(access.order)
  return NextResponse.json({
    status: access.order.status,
    version,
    revisionsRemaining: access.order.revisions_remaining,
  })
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params
  const token = new URL(req.url).searchParams.get('t')
  const access = await authorizeOrderAccess(key, token)
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status })
  const order = access.order

  const body = (await req.json().catch(() => null)) as {
    action?: unknown
    items?: unknown
    isCorrection?: unknown
  } | null
  const action = typeof body?.action === 'string' ? body.action : ''

  // ── Approve ───────────────────────────────────────────────────────────────
  if (action === 'approve') {
    if (order.status !== 'client_review') {
      return NextResponse.json(
        { message: 'This design is not open for review right now.' },
        { status: 409 },
      )
    }
    try {
      // transition_order cascades approved → awaiting_balance automatically and
      // unconditionally, so approval raises the invoice in the same breath. It
      // does NOT release the file; only settlement does.
      const updated = await transitionOrder({
        orderId: order.id,
        to: 'approved',
        eventType: 'order.approved',
        actorType: 'customer',
        actorId: access.userId,
      })
      const ledger = await getLedger(order.id)
      return NextResponse.json({
        status: updated.status,
        outstandingTzs: Math.max(ledger?.outstandingTzs ?? 0, 0),
        message: 'Approved. Settle the balance and your files are released immediately.',
      })
    } catch (error) {
      if (error instanceof TransitionError) {
        return NextResponse.json({ message: error.message }, { status: 409 })
      }
      throw error
    }
  }

  // ── Request changes ───────────────────────────────────────────────────────
  if (action === 'request_changes') {
    if (order.status !== 'client_review') {
      return NextResponse.json(
        { message: 'This design is not open for review right now.' },
        { status: 409 },
      )
    }
    const parsed = validateRevisionItems(body?.items)
    if (!parsed.ok) return NextResponse.json({ message: parsed.message }, { status: 400 })

    // The "this is a mistake, not a change" path. Free, unlimited, and it does
    // not touch the allowance — enforced in the database, not here.
    const isCorrection = body?.isCorrection === true

    const result = await openRevisionRound({
      orderId: order.id,
      items: parsed.items,
      isCorrection,
      actorId: access.userId,
    })
    if (!result.ok) {
      if (result.needsTopup) {
        // Not an error state: this is the moment to offer the paid round.
        return NextResponse.json(
          {
            needsTopup: true,
            message:
              'You have used the revisions included with your package. You can add another round for a small charge, collected with your balance.',
          },
          { status: 409 },
        )
      }
      return NextResponse.json({ message: result.message }, { status: 409 })
    }

    return NextResponse.json({
      status: 'in_design',
      message: isCorrection
        ? 'Thank you — we will fix that. Corrections are free and do not use a revision.'
        : 'Sent to your designer.',
    })
  }

  // ── Accept the top-up charge ──────────────────────────────────────────────
  if (action === 'accept_topup') {
    const result = await acceptTopup(order.id, access.userId)
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 409 })
    const ledger = await getLedger(order.id)
    return NextResponse.json({
      chargeTzs: result.chargeTzs,
      outstandingTzs: Math.max(ledger?.outstandingTzs ?? 0, 0),
      message: 'Added to your balance. You can now request another round of changes.',
    })
  }

  return NextResponse.json({ message: 'Unknown action.' }, { status: 400 })
}
