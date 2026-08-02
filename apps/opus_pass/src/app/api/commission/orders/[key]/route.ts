import { NextResponse } from 'next/server'
import {
  CARD_ORDER_STATUS_LABELS,
  responsibleParty,
  stepForStatus,
} from '@opusfesta/lib'
import { authorizeOrderAccess } from '@/lib/commission/access'
import { getLedger, getTimeline, listPayments } from '@/lib/commission/orders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/commission/orders/:key — the customer's view of one commission.
 * Auth: claim token or Clerk (OP-CCS-TDD-001 §8).
 *
 * Returns the order, its derived financial position and its timeline. PRD §7.9
 * requires the payment summary to be visible "from checkout onward", and both
 * money steps to be visible from the start, so the balance is never a surprise
 * at the end — which is why `outstandingTzs` and the full step list are in
 * every response, not just the ones near the end of the flow.
 *
 * Never returns storage paths. Pre-settlement the customer sees watermarked
 * previews through a short-lived signed URL issued by a separate route, and the
 * clean master does not exist in storage at all until settlement.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params
  const token = new URL(req.url).searchParams.get('t')

  const access = await authorizeOrderAccess(key, token)
  if (!access.ok) {
    return NextResponse.json({ message: access.message }, { status: access.status })
  }
  const { order } = access

  const [ledger, payments, timeline] = await Promise.all([
    getLedger(order.id),
    listPayments(order.id),
    getTimeline(order.id, 'customer'),
  ])

  return NextResponse.json({
    order: {
      orderNo: order.order_no,
      status: order.status,
      statusLabel: CARD_ORDER_STATUS_LABELS[order.status],
      step: stepForStatus(order.status),
      // PRD §8: every screen answers "what happens next and who is holding it"
      // without the user having to ask.
      waitingOn: responsibleParty(order.status),
      packageId: order.package_id,
      categoryId: order.category_id,
      locale: order.locale,
      eventName: order.provisional_event_name,
      eventDate: order.provisional_event_date,
      claimed: order.user_id !== null,
      attachedToEvent: order.event_id !== null,
      revisionsRemaining: order.revisions_remaining,
      slaDueAt: order.sla_due_at,
      balanceDueAt: order.balance_due_at,
      createdAt: order.created_at,
    },
    money: ledger && {
      totalTzs: ledger.totalTzs,
      paidTzs: ledger.paidTzs,
      creditsTzs: ledger.creditsTzs,
      outstandingTzs: Math.max(ledger.outstandingTzs, 0),
      depositDueTzs: ledger.depositDueTzs,
      depositPaidTzs: ledger.depositPaidTzs,
    },
    // Only what the buyer needs to recognise their own payments. No raw
    // provider payloads, no internal review notes on unresolved rows.
    payments: payments.map((p) => ({
      purpose: p.purpose,
      channel: p.channel,
      state: p.state,
      expectedTzs: p.expected_tzs,
      receivedTzs: p.received_tzs,
      reference: p.provider_ref,
      createdAt: p.created_at,
      // A rejection note is written FOR the customer ("the reference did not
      // match"), so it is shown; notes on other states are internal.
      note: p.state === 'rejected' ? p.review_note : null,
    })),
    timeline: timeline.map((e) => ({
      at: e.created_at,
      type: e.event_type,
      to: e.to_status,
      actor: e.actor_type,
    })),
  })
}
