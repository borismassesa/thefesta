'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail, requirePermission } from '@/lib/admin-auth'

/**
 * Finance decisions on a commission payment.
 * Specs: OP-CCS-PRD-001 §7.2.4; loopholes L1, L17, L18.
 *
 * Two properties these actions must have, and the reasons they are structured
 * the way they are:
 *
 *   1. EVERY decision is attributable to a named person. `verified_by` carries
 *      the reviewing employee's id and the timeline event carries their
 *      identity. A payment that "was approved" with no approver is exactly the
 *      hole L1 describes.
 *
 *   2. Approving an insufficient amount is IMPOSSIBLE, not merely discouraged.
 *      These actions do not decide whether a gate opens — `transition_order()`
 *      does, by calling deposit_satisfied() / fully_settled(). An officer who
 *      approves a short payment credits the money and the order stays put with
 *      the shortfall shown; the gate does not open. There is no code path here
 *      that could override that, and adding one would require changing the
 *      database.
 */

/**
 * The reviewing employee's id, for attribution.
 *
 * Resolved by Clerk subject rather than email, matching how the rest of the
 * admin app identifies staff: an employee's email can be edited, and matching
 * on it would silently mis-attribute an approval after a rename.
 */
async function callerEmployeeId(): Promise<{ id: string; email: string | null }> {
  const email = await getCallerEmail()
  const { userId: clerkId } = await auth()
  if (clerkId) {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('workforce_employees')
      .select('id')
      .eq('clerk_user_id', clerkId)
      .maybeSingle<{ id: string }>()
    if (data?.id) return { id: data.id, email }
  }
  // Owners can predate the workforce table. Fall back to the email rather than
  // dropping attribution entirely — an unattributable approval is exactly the
  // hole L1 describes, so "imperfectly typed" beats "anonymous".
  return { id: email ?? 'unknown', email }
}

export type DecisionResult = { ok: true; message: string } | { ok: false; message: string }

/**
 * Approve a Lipa Namba payment.
 *
 * `receivedTzs` is what the officer actually read off the merchant statement,
 * NOT what we asked for. Those differ often, and recording the real figure is
 * the whole point: the ledger then computes the shortfall or the credit by
 * itself, with no judgement call and no second system to reconcile.
 */
export async function approveCommissionPayment(formData: FormData): Promise<DecisionResult> {
  await requirePermission('finance.write')

  const paymentId = String(formData.get('paymentId') ?? '')
  const rawAmount = String(formData.get('receivedTzs') ?? '').replace(/[^\d]/g, '')
  const note = String(formData.get('note') ?? '').trim()

  if (!paymentId) return { ok: false, message: 'Missing payment.' }

  const receivedTzs = Number(rawAmount)
  if (!Number.isFinite(receivedTzs) || receivedTzs <= 0) {
    return { ok: false, message: 'Enter the amount that actually arrived, in whole shillings.' }
  }
  // A mandatory note on approval as well as rejection: this is the record of
  // which statement line the reference was matched against.
  if (note.length < 3) {
    return { ok: false, message: 'Add a note saying what you matched this against.' }
  }

  const { id: employeeId } = await callerEmployeeId()
  const supabase = createSupabaseAdminClient()

  const { data: payment, error: payErr } = await supabase
    .from('order_payments')
    .update({
      state: 'verified',
      received_tzs: receivedTzs,
      verified_by: employeeId,
      verified_at: new Date().toISOString(),
      review_note: note,
    })
    .eq('id', paymentId)
    // Guarded so two officers clicking at once cannot both credit the order.
    .eq('state', 'pending_review')
    .select('id, order_id, purpose')
    .maybeSingle<{ id: string; order_id: string; purpose: string }>()

  if (payErr) return { ok: false, message: payErr.message }
  if (!payment) {
    return { ok: false, message: 'That payment has already been reviewed by someone else.' }
  }

  // Now ask the ledger — not the officer — whether the gate opens.
  const [{ data: ledger }, { data: order }] = await Promise.all([
    supabase
      .from('order_ledger')
      .select('deposit_due_tzs, deposit_paid_tzs, effective_total_tzs, outstanding_tzs')
      .eq('order_id', payment.order_id)
      .maybeSingle<{
        deposit_due_tzs: number
        deposit_paid_tzs: number
        effective_total_tzs: number
        outstanding_tzs: number
      }>(),
    supabase
      .from('card_orders')
      .select('status, order_no')
      .eq('id', payment.order_id)
      .maybeSingle<{ status: string; order_no: string }>(),
  ])
  if (!ledger || !order) return { ok: false, message: 'That order could not be read back.' }

  const isDeposit = payment.purpose === 'deposit'
  const depositTarget = Math.min(ledger.deposit_due_tzs, Math.max(ledger.effective_total_tzs, 0))
  const gateOpen = isDeposit
    ? ledger.deposit_paid_tzs >= depositTarget
    : ledger.outstanding_tzs <= 0
  const shortfall = isDeposit
    ? Math.max(depositTarget - ledger.deposit_paid_tzs, 0)
    : Math.max(ledger.outstanding_tzs, 0)

  const target = gateOpen
    ? isDeposit
      ? 'deposit_paid'
      : 'settled'
    : isDeposit
      ? 'awaiting_deposit' // self-loop: money credited, shortfall notified
      : 'awaiting_balance'

  const { error: transErr } = await supabase.rpc('transition_order', {
    p_order_id: payment.order_id,
    p_to: target,
    p_event_type: gateOpen
      ? isDeposit
        ? 'deposit.approved'
        : 'balance.settled'
      : 'payment.short',
    p_actor_type: 'finance',
    p_actor_id: employeeId,
    p_payload: {
      payment_id: payment.id,
      received_tzs: receivedTzs,
      shortfall_tzs: shortfall,
      note,
    },
  })

  revalidatePath('/finance/commissions')

  if (transErr) {
    // The money is recorded either way — that is the part that must not be
    // lost. Say plainly that the order did not move, rather than reporting a
    // success the operator would then have to discover was partial.
    console.error('[commission-finance] transition after approval failed', transErr)
    return {
      ok: false,
      message: `Payment recorded, but ${order.order_no} did not move: ${transErr.message}`,
    }
  }

  if (!gateOpen) {
    return {
      ok: true,
      message: `Credited TZS ${receivedTzs.toLocaleString('en-US')} to ${order.order_no}. Still short TZS ${shortfall.toLocaleString('en-US')} — the customer has been told.`,
    }
  }
  return {
    ok: true,
    message: isDeposit
      ? `${order.order_no} deposit confirmed — it can now enter the design queue.`
      : `${order.order_no} is paid in full and the card has been released.`,
  }
}

/** Reject a payment. The note is mandatory and is shown to the customer. */
export async function rejectCommissionPayment(formData: FormData): Promise<DecisionResult> {
  await requirePermission('finance.write')

  const paymentId = String(formData.get('paymentId') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  if (!paymentId) return { ok: false, message: 'Missing payment.' }
  if (note.length < 3) {
    return {
      ok: false,
      message: 'A reason is required — the customer sees this, so tell them what to fix.',
    }
  }

  const { id: employeeId } = await callerEmployeeId()
  const supabase = createSupabaseAdminClient()

  const { data: payment, error } = await supabase
    .from('order_payments')
    .update({
      state: 'rejected',
      verified_by: employeeId,
      verified_at: new Date().toISOString(),
      review_note: note,
    })
    .eq('id', paymentId)
    .eq('state', 'pending_review')
    .select('id, order_id, purpose')
    .maybeSingle<{ id: string; order_id: string; purpose: string }>()

  if (error) return { ok: false, message: error.message }
  if (!payment) {
    return { ok: false, message: 'That payment has already been reviewed by someone else.' }
  }

  const { data: order } = await supabase
    .from('card_orders')
    .select('status, order_no')
    .eq('id', payment.order_id)
    .maybeSingle<{ status: string; order_no: string }>()

  const target = order?.status === 'balance_review' ? 'balance_rejected' : 'deposit_rejected'
  const { error: transErr } = await supabase.rpc('transition_order', {
    p_order_id: payment.order_id,
    p_to: target,
    p_event_type: 'payment.rejected',
    p_actor_type: 'finance',
    p_actor_id: employeeId,
    p_payload: { payment_id: payment.id, note },
  })

  revalidatePath('/finance/commissions')

  if (transErr) {
    console.error('[commission-finance] transition after rejection failed', transErr)
    return {
      ok: false,
      message: `Rejection recorded, but the order did not move: ${transErr.message}`,
    }
  }
  return {
    ok: true,
    message: `${order?.order_no ?? 'The order'} was rejected and the customer has been asked to recheck their reference.`,
  }
}
