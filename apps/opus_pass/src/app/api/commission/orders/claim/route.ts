import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireDashboardUser } from '@/lib/dashboard/auth'
import { consumeClaimToken } from '@/lib/commission/claim-tokens'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/commission/orders/claim — bind an anonymous order to the
 * signed-in account, and to an event.
 * Specs: OP-CCS-PRD-001 §7.1; OP-CCS-TDD-001 §5.1, §8.
 *
 * The acceptance criterion this route exists to satisfy: a buyer with no
 * account can pay, complete the brief and receive a finished card, with the
 * order correctly attached to their event after they sign up — with no manual
 * Ops intervention.
 *
 * Three shapes of request, all handled here so the buyer never has to
 * understand which one they are in:
 *   - they already have the right event      → link it
 *   - they have an account but no event      → create one from what they
 *                                              entered at checkout
 *   - they have several events               → the client passes the chosen id
 */
export async function POST(req: Request): Promise<NextResponse> {
  // Claiming REQUIRES a session. The token alone never binds an order — that
  // is the whole reason a leaked link is not an account takeover (loophole L4).
  const user = await requireDashboardUser()

  const body = (await req.json().catch(() => null)) as {
    token?: unknown
    eventId?: unknown
    createEvent?: unknown
  } | null

  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) {
    return NextResponse.json({ message: 'That link is missing its code.' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  let eventId: string | null =
    typeof body?.eventId === 'string' && body.eventId ? body.eventId : null

  // Never trust a client-supplied event id: confirm it belongs to this user
  // before an order is attached to it.
  if (eventId) {
    const { data } = await supabase
      .from('wedding_events')
      .select('id')
      .eq('id', eventId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!data) {
      return NextResponse.json({ message: 'That event could not be found.' }, { status: 404 })
    }
  }

  const result = await consumeClaimToken({ token, userId: user.id, eventId })
  if (!result.ok) {
    const message =
      result.reason === 'owned_by_other'
        ? 'This order is already attached to another account. Contact support if that is wrong.'
        : result.reason === 'expired' || result.reason === 'revoked'
          ? 'That link has expired. Contact support and we will send you a new one.'
          : 'That link is not valid.'
    return NextResponse.json({ message }, { status: result.reason === 'owned_by_other' ? 409 : 403 })
  }

  const order = result.order

  // "Create event from this order" — the buyer told us the name and date at
  // checkout, so there is nothing more to ask them for.
  if (!order.event_id && body?.createEvent === true) {
    const { data: created, error } = await supabase
      .from('wedding_events')
      .insert({
        user_id: user.id,
        name: order.provisional_event_name || 'Our celebration',
        event_type: order.category_id === 'wedding' ? 'ceremony' : 'other',
        starts_at: order.provisional_event_date
          ? new Date(`${order.provisional_event_date}T12:00:00Z`).toISOString()
          : null,
      })
      .select('id')
      .single()
    if (error) {
      // The order is claimed either way — that is the part that must not be
      // lost. The event can be created from the dashboard.
      console.error('[commission] could not create an event during claim', error)
    } else {
      eventId = (created as { id: string }).id
      await supabase.from('card_orders').update({ event_id: eventId }).eq('id', order.id)
    }
  }

  return NextResponse.json({
    orderNo: order.order_no,
    status: order.status,
    alreadyClaimed: result.alreadyClaimed,
    eventId: eventId ?? order.event_id,
    // Delivery is the ONE step that needs an event. Saying so here lets the UI
    // prompt at the right moment instead of at the end.
    needsEvent: !(eventId ?? order.event_id),
  })
}
