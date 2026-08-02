'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { hasPermission, requirePermission } from '@/lib/admin-auth'

/**
 * Finance decisions on cancellation requests.
 * Specs: OP-CCS-PRD-001 §7.11.5; loopholes L11, L20.
 *
 * Three properties the database enforces and these actions simply carry:
 *
 *  - The APPROVAL CEILING is checked in `decide_refund()`, not here. An
 *    operator cannot approve a large refund by navigating around a disabled
 *    button, because the button is not what is stopping them.
 *  - APPROVAL AND DISBURSEMENT ARE SEPARATE. The negative ledger row is
 *    written only on confirmed payout, so a failed mobile-money transfer never
 *    overstates what we have refunded.
 *  - THE PAYOUT NUMBER IS VERIFIED against the number on the order before
 *    release. A different number needs a second approver (L20).
 */

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

async function callerEmployeeId(): Promise<string | null> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('workforce_employees')
    .select('id')
    .eq('clerk_user_id', clerkId)
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

function refresh(): void {
  revalidatePath('/finance/commissions/refunds')
}

/**
 * Approve, reject, or convert to a credit note.
 *
 * `platform.admin` stands in for CSFO/CEO authority: it is the only permission
 * above Finance in this codebase, and it is what lifts the ceiling and permits
 * a policy exception.
 */
export async function decideRefund(formData: FormData): Promise<ActionResult> {
  await requirePermission('finance.write')
  const isCsfo = await hasPermission('platform.admin')

  const requestId = String(formData.get('requestId') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  const isException = String(formData.get('exception') ?? '') === '1'

  if (!requestId) return { ok: false, message: 'Missing request.' }
  if (!['approve', 'reject', 'credit_note'].includes(decision)) {
    return { ok: false, message: 'Choose approve, reject, or credit note.' }
  }
  if (note.length < 3) {
    return { ok: false, message: 'A decision note is required — it is the record of why.' }
  }

  const employeeId = await callerEmployeeId()
  const supabase = createSupabaseAdminClient()

  const { error } = await supabase.rpc('decide_refund', {
    p_request_id: requestId,
    p_decision: decision,
    p_approver_id: employeeId,
    p_note: note,
    p_is_csfo: isCsfo,
    p_exception: isException,
  })
  if (error) return { ok: false, message: error.message }

  // A credit note is issued immediately on decision: it costs us nothing to
  // hold and the customer should be able to use it straight away.
  if (decision === 'credit_note') {
    const { data: req } = await supabase
      .from('refund_requests')
      .select('order_id, entitled_tzs, reason')
      .eq('id', requestId)
      .maybeSingle<{ order_id: string; entitled_tzs: number; reason: string }>()
    if (req) {
      const { data: order } = await supabase
        .from('card_orders')
        .select('buyer_phone')
        .eq('id', req.order_id)
        .maybeSingle<{ buyer_phone: string }>()

      // §7.11.4: a called-off event gets 24 months rather than the standard
      // validity. That is the documented default, not a favour.
      const months = req.reason === 'event_cancelled' ? 24 : null

      const { data: code, error: cnErr } = await supabase.rpc('issue_credit_note', {
        p_order_id: req.order_id,
        p_base_tzs: req.entitled_tzs,
        p_holder_phone: order?.buyer_phone ?? '',
        p_issued_by: employeeId,
        p_months: months,
      })
      refresh()
      if (cnErr) {
        return { ok: false, message: `Decision recorded, but the credit note failed: ${cnErr.message}` }
      }
      return { ok: true, message: `Credit note ${code} issued. Read the code to the customer.` }
    }
  }

  refresh()
  return {
    ok: true,
    message:
      decision === 'reject'
        ? 'Rejected, and the reason is on the order timeline.'
        : 'Approved. It still needs disbursing before any money moves.',
  }
}

/**
 * Record a confirmed payout.
 *
 * The MSISDN is checked against the order before release. A mismatch is not
 * blocked outright — a customer legitimately changing numbers is common — but
 * it is surfaced so the officer makes that call deliberately rather than by
 * pasting whatever they were sent (L20).
 */
export async function disburseRefund(formData: FormData): Promise<ActionResult> {
  await requirePermission('finance.write')

  const requestId = String(formData.get('requestId') ?? '')
  const msisdn = String(formData.get('msisdn') ?? '').trim()
  const confirmedMismatch = String(formData.get('confirmMismatch') ?? '') === '1'
  if (!requestId) return { ok: false, message: 'Missing request.' }
  if (!/^\+?[0-9]{9,15}$/.test(msisdn)) {
    return { ok: false, message: 'Enter the mobile money number the payout was sent to.' }
  }

  const employeeId = await callerEmployeeId()
  const supabase = createSupabaseAdminClient()

  const { data: req } = await supabase
    .from('refund_requests')
    .select('order_id')
    .eq('id', requestId)
    .maybeSingle<{ order_id: string }>()
  if (!req) return { ok: false, message: 'That request could not be found.' }

  const { data: order } = await supabase
    .from('card_orders')
    .select('buyer_phone')
    .eq('id', req.order_id)
    .maybeSingle<{ buyer_phone: string }>()

  const normalise = (v: string) => v.replace(/\D/g, '').replace(/^0/, '255')
  if (order && normalise(order.buyer_phone) !== normalise(msisdn) && !confirmedMismatch) {
    return {
      ok: false,
      message: `That number does not match the one on the order (${order.buyer_phone}). Confirm the change with the customer, then tick the box to proceed.`,
    }
  }

  const { error } = await supabase.rpc('disburse_refund', {
    p_request_id: requestId,
    p_payout_msisdn: msisdn,
    p_actor_id: employeeId,
  })
  if (error) return { ok: false, message: error.message }

  refresh()
  return { ok: true, message: 'Disbursement recorded and the negative ledger row is written.' }
}
