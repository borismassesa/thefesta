import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { authorizeOrderAccess } from '@/lib/commission/access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cancellation: quote first, then request.
 * Specs: OP-CCS-PRD-001 §7.11; loopholes L11, L19.
 *
 *   GET   what you would get if you cancelled right now, plus the alternatives
 *   POST  log the request, freezing the entitlement
 *
 * The GET exists because §7.11 is a graded policy, and a customer who
 * discovers the grade AFTER cancelling feels tricked even when the number is
 * correct. Quoting first turns an argument into an informed decision.
 *
 * The quote and the eventual decision both come from `refund_entitlement()`,
 * so they cannot disagree. Nothing in this route computes a refund figure.
 */

const ALLOWED_REASONS = [
  'customer_cancelled',
  'event_cancelled',
  'opusfesta_fault',
  'defective_deliverable',
  'other',
] as const

export async function GET(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params
  const token = new URL(req.url).searchParams.get('t')
  const access = await authorizeOrderAccess(key, token)
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status })

  const supabase = createSupabaseServerClient()
  type Quote = {
    entitled_pct: number
    entitled_tzs: number
    deposit_paid_tzs: number
    credit_note_tzs: number
    postponements_left: number
  }
  // A TABLE-returning RPC arrives as an array; supabase-js cannot infer that
  // from the generated types here, so the shape is asserted rather than
  // declared through .returns<>().
  const { data, error } = await supabase.rpc('refund_quote', { p_order_id: access.order.id })
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  const quote = (Array.isArray(data) ? data[0] : data) as Quote | undefined

  const { data: openRequest } = await supabase
    .from('refund_requests')
    .select('id, state, entitled_tzs, requested_at')
    .eq('order_id', access.order.id)
    .in('state', ['requested', 'approved'])
    .maybeSingle<{ id: string; state: string; entitled_tzs: number; requested_at: string }>()

  return NextResponse.json({
    status: access.order.status,
    quote,
    // Offered ahead of cash on purpose: §7.11.3 ranks the remedies, and most
    // disputes should never become refunds. A postponement keeps the order
    // alive; a credit note is worth 10% more than the cash.
    alternatives: {
      postponement: (quote?.postponements_left ?? 0) > 0,
      creditNoteTzs: quote?.credit_note_tzs ?? 0,
      rework: ['client_review', 'revision_requested', 'in_design'].includes(access.order.status),
    },
    openRequest,
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

  const body = (await req.json().catch(() => null)) as { reason?: unknown; note?: unknown } | null
  const reason = typeof body?.reason === 'string' ? body.reason : ''
  if (!(ALLOWED_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ message: 'Choose a reason for cancelling.' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : null

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.rpc('request_refund', {
    p_order_id: access.order.id,
    p_reason: reason,
    p_via: 'app',
    p_note: note,
    p_requested_by: access.userId,
  })
  if (error) {
    // An existing open request is not an error worth alarming anyone about.
    if (/already has an open refund request/i.test(error.message)) {
      return NextResponse.json(
        { message: 'We are already looking at your cancellation request.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ message: error.message }, { status: 409 })
  }

  const { data: created } = await supabase
    .from('refund_requests')
    .select('entitled_pct, entitled_tzs')
    .eq('id', String(data))
    .maybeSingle<{ entitled_pct: number; entitled_tzs: number }>()

  return NextResponse.json({
    requestId: String(data),
    entitledPct: created?.entitled_pct ?? null,
    entitledTzs: created?.entitled_tzs ?? null,
    // The decision SLA is quoted so the customer knows when to expect an
    // answer rather than having to chase us for one.
    message:
      'Your request is logged. Finance will decide within 3 business days, and the amount is fixed as of today — our processing time cannot reduce it.',
  })
}
