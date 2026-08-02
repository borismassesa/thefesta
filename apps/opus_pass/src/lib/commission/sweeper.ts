import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import { mapSelcomStatus, queryOrderStatus } from '@/lib/payments/selcom'
import { transitionOrder, TransitionError, verifyPaymentAndAdvance } from './orders'
import { publishSettledOrder } from './publish'
import { dispatchOutbox } from './dispatcher'

/**
 * The commission sweeper.
 * Specs: OP-CCS-PRD-001 §7.2.3, §7.11.7; OP-CCS-TDD-001 §5.4, §10.
 *
 * Everything time-based in this feature happens here. Without it the lifecycle
 * stalls in exactly the places the loophole register warns about: an order
 * nobody accepts (L8), a customer who never approves so the balance is never
 * triggered (L15), a review left open forever (L7), and a balance that is
 * never chased.
 *
 * Design rules for every pass below:
 *
 *   - IDEMPOTENT. It may run every 5 minutes or once a day, and a re-run must
 *     never re-send a reminder or double-transition an order. Reminders are
 *     claimed through a unique key; transitions are guarded by the state
 *     machine, which rejects an illegal repeat.
 *   - INDEPENDENT. One pass failing must not stop the others. A Selcom outage
 *     should not also stop the forfeiture clock, so every pass is caught
 *     separately and reported in the result.
 *   - CADENCE-AGNOSTIC. Nothing assumes a five-minute tick. Every decision is
 *     made from timestamps in the database, so running late produces the same
 *     end state as running on time — just later.
 */

export type SweepResult = {
  pass: string
  examined: number
  acted: number
  errors: string[]
}

async function claimReminder(orderId: string, kind: string): Promise<boolean> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.rpc('claim_commission_reminder', {
    p_order_id: orderId,
    p_kind: kind,
  })
  if (error) {
    console.error('[commission-sweeper] reminder claim failed', error)
    return false
  }
  return data === true
}

async function enqueue(orderId: string, eventType: string, variables: Record<string, unknown> = {}): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.rpc('enqueue_card_notifications', {
    p_order_id: orderId,
    p_event_type: eventType,
    p_variables: variables,
  })
  if (error) console.error('[commission-sweeper] enqueue failed', error)
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. Auto-approve (L7, L15)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Approve reviews left open past the package window.
 *
 * This is what stops "refuse to approve indefinitely so the balance is never
 * triggered" from working. It moves the order to `awaiting_balance` — it
 * releases the INVOICE, never the asset.
 */
export async function sweepAutoApprove(): Promise<SweepResult> {
  const result: SweepResult = { pass: 'auto_approve', examined: 0, acted: 0, errors: [] }
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('commission_auto_approve_due')
    .select('order_id, order_no')
    .returns<{ order_id: string; order_no: string }[]>()
  if (error) {
    result.errors.push(error.message)
    return result
  }
  result.examined = data?.length ?? 0

  for (const row of data ?? []) {
    try {
      await transitionOrder({
        orderId: row.order_id,
        to: 'approved',
        eventType: 'order.approved',
        actorType: 'system',
        payload: { reason: 'auto_approve_window_elapsed' },
      })
      result.acted++
    } catch (error) {
      // A guard refusal here is normal — the customer may have approved or
      // opened a revision between the view being read and this line running.
      if (!(error instanceof TransitionError)) {
        result.errors.push(`${row.order_no}: ${(error as Error).message}`)
      }
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. Accept-SLA breach (L8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return unaccepted assignments to the queue.
 *
 * Capped at two bounces: after that the order stays put and Ops is alerted,
 * because a third automatic reassignment is a queue quietly hiding the fact
 * that nobody is picking the work up.
 */
export async function sweepAcceptSla(): Promise<SweepResult> {
  const result: SweepResult = { pass: 'accept_sla', examined: 0, acted: 0, errors: [] }
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('commission_accept_overdue')
    .select('order_id, order_no, assign_bounces')
    .returns<{ order_id: string; order_no: string; assign_bounces: number }[]>()
  if (error) {
    result.errors.push(error.message)
    return result
  }
  result.examined = data?.length ?? 0

  for (const row of data ?? []) {
    try {
      if (row.assign_bounces >= 2) {
        // Alert rather than loop.
        if (await claimReminder(row.order_id, 'accept_breach_escalated')) {
          await enqueue(row.order_id, 'task.accept_breach', { bounces: row.assign_bounces })
          result.acted++
        }
        continue
      }
      await transitionOrder({
        orderId: row.order_id,
        to: 'queued',
        eventType: 'task.accept_breach',
        actorType: 'system',
        payload: { bounces: row.assign_bounces + 1 },
      })
      result.acted++
    } catch (error) {
      if (!(error instanceof TransitionError)) {
        result.errors.push(`${row.order_no}: ${(error as Error).message}`)
      }
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. Auto-assign
// ─────────────────────────────────────────────────────────────────────────────

/** Assign queued orders to the best available designer. */
export async function sweepAutoAssign(): Promise<SweepResult> {
  const result: SweepResult = { pass: 'auto_assign', examined: 0, acted: 0, errors: [] }
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('card_orders')
    .select('id, order_no')
    .eq('status', 'queued')
    .is('archived_at', null)
    .returns<{ id: string; order_no: string }[]>()
  if (error) {
    result.errors.push(error.message)
    return result
  }
  result.examined = data?.length ?? 0

  for (const row of data ?? []) {
    const { data: assigned, error: assignErr } = await supabase.rpc('assign_card_order', {
      p_order_id: row.id,
      p_employee_id: null,
      p_actor_type: 'system',
      p_actor_id: null,
    })
    if (assignErr) {
      result.errors.push(`${row.order_no}: ${assignErr.message}`)
      continue
    }
    // NULL means no capacity. That is a real answer, not a failure — the order
    // stays queued and the capacity banner in Admin is what surfaces it.
    if (assigned) result.acted++
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. Balance chase (PRD §7.2.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chase the balance, then let it go overdue, then forfeit.
 *
 * This is where the money is genuinely at risk, because the work is already
 * done. The cadence compresses when the event is within 14 days: someone whose
 * wedding is next week needs a phone call, not a fourth WhatsApp message.
 */
export async function sweepBalanceChase(): Promise<SweepResult> {
  const result: SweepResult = { pass: 'balance_chase', examined: 0, acted: 0, errors: [] }
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('commission_balance_chase')
    .select('order_id, order_no, status, hours_since_invoice, urgent, outstanding_tzs, balance_due_at')
    .returns<{
      order_id: string
      order_no: string
      status: string
      hours_since_invoice: number
      urgent: boolean | null
      outstanding_tzs: number
      balance_due_at: string | null
    }[]>()
  if (error) {
    result.errors.push(error.message)
    return result
  }
  result.examined = data?.length ?? 0

  for (const row of data ?? []) {
    try {
      const urgent = row.urgent === true
      const firstAt = urgent ? 12 : 24
      const secondAt = urgent ? 48 : 72
      const elapsed = Number(row.hours_since_invoice ?? 0)

      if (elapsed >= firstAt && (await claimReminder(row.order_id, 'balance_first'))) {
        await enqueue(row.order_id, 'balance.reminder', {
          outstanding_tzs: row.outstanding_tzs,
          urgent,
        })
        result.acted++
      }
      if (elapsed >= secondAt && (await claimReminder(row.order_id, 'balance_second'))) {
        await enqueue(row.order_id, 'balance.reminder', {
          outstanding_tzs: row.outstanding_tzs,
          urgent,
          escalate_to_ops: true,
        })
        result.acted++
      }

      // Past the due date, move to overdue so Ops gets a call task with the
      // customer's number rather than another automated message.
      if (
        row.status === 'awaiting_balance' &&
        row.balance_due_at &&
        new Date(row.balance_due_at).getTime() <= Date.now()
      ) {
        await transitionOrder({
          orderId: row.order_id,
          to: 'balance_overdue',
          eventType: 'balance.overdue',
          actorType: 'system',
          payload: { outstanding_tzs: row.outstanding_tzs },
        })
        result.acted++
      }
    } catch (error) {
      if (!(error instanceof TransitionError)) {
        result.errors.push(`${row.order_no}: ${(error as Error).message}`)
      }
    }
  }
  return result
}

/**
 * Forfeit orders past the window.
 *
 * The deposit is retained and the order archived. Nothing is destroyed: paying
 * later still releases the asset normally, and the designer's work is never
 * lost. Forfeiture is a pause on delivery, not a deletion.
 */
export async function sweepForfeiture(): Promise<SweepResult> {
  const result: SweepResult = { pass: 'forfeiture', examined: 0, acted: 0, errors: [] }
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('commission_forfeiture_due')
    .select('order_id, order_no')
    .returns<{ order_id: string; order_no: string }[]>()
  if (error) {
    result.errors.push(error.message)
    return result
  }
  result.examined = data?.length ?? 0

  for (const row of data ?? []) {
    try {
      await transitionOrder({
        orderId: row.order_id,
        to: 'forfeited',
        eventType: 'order.forfeited',
        actorType: 'system',
        payload: { reason: 'balance_window_elapsed', deposit_retained: true },
      })
      result.acted++
    } catch (error) {
      if (!(error instanceof TransitionError)) {
        result.errors.push(`${row.order_no}: ${(error as Error).message}`)
      }
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. Selcom reconciliation (TDD §10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Catch payments whose webhook never arrived.
 *
 * A webhook that never lands is not hypothetical on mobile networks here, and
 * a customer who has genuinely paid and sees nothing happen is the worst
 * support call in the flow. This re-queries Selcom for anything initiated more
 * than 15 minutes ago and still unresolved.
 */
export async function sweepReconciliation(): Promise<SweepResult> {
  const result: SweepResult = { pass: 'reconciliation', examined: 0, acted: 0, errors: [] }
  const supabase = createSupabaseServerClient()

  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString()
  const { data, error } = await supabase
    .from('order_payments')
    .select('id, order_id, provider_ref, expected_tzs, purpose')
    .eq('state', 'initiated')
    .in('channel', ['selcom_card', 'selcom_mobile'])
    .not('provider_ref', 'is', null)
    .lt('created_at', cutoff)
    .limit(50)
    .returns<{
      id: string
      order_id: string
      provider_ref: string
      expected_tzs: number
      purpose: string
    }[]>()
  if (error) {
    result.errors.push(error.message)
    return result
  }
  result.examined = data?.length ?? 0

  for (const payment of data ?? []) {
    try {
      // The provider reference we send Selcom is the order_no (deposit) or
      // order_no-B (balance); the transid carries a suffix. Strip it back to
      // the order reference Selcom knows.
      const selcomRef = payment.provider_ref.replace(/-(D|B)\d*$/, (m) =>
        m.startsWith('-B') ? '-B' : '',
      )
      const status = await queryOrderStatus(selcomRef)
      const record = status.data?.[0] ?? {}
      const mapped = mapSelcomStatus(record.payment_status ?? status.result)

      if (mapped === 'paid') {
        const amount = Number(record.amount ?? payment.expected_tzs)
        if (!Number.isFinite(amount) || amount <= 0) continue
        await verifyPaymentAndAdvance({
          paymentId: payment.id,
          receivedTzs: Math.round(amount),
          verifiedBy: 'selcom_reconciliation',
          actorType: 'system',
        })
        result.acted++
      } else if (mapped === 'failed') {
        await supabase
          .from('order_payments')
          .update({ state: 'void', review_note: 'Selcom reported this payment failed.' })
          .eq('id', payment.id)
          .eq('state', 'initiated')
        result.acted++
      }
    } catch (error) {
      result.errors.push(`${payment.provider_ref}: ${(error as Error).message}`)
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. Delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publish settled orders into their event.
 *
 * Retried here rather than only at settlement, because TDD §10 is explicit:
 * a verified payment is durable and must NEVER be rolled back because a
 * downstream publish failed. So settlement stands, and delivery is retried
 * until it succeeds.
 */
export async function sweepDelivery(): Promise<SweepResult> {
  const result: SweepResult = { pass: 'delivery', examined: 0, acted: 0, errors: [] }
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('card_orders')
    .select('id, order_no')
    .eq('status', 'settled')
    .not('event_id', 'is', null)
    .limit(50)
    .returns<{ id: string; order_no: string }[]>()
  if (error) {
    result.errors.push(error.message)
    return result
  }
  result.examined = data?.length ?? 0

  for (const row of data ?? []) {
    try {
      const published = await publishSettledOrder(row.id)
      if (published.ok) result.acted++
      else result.errors.push(`${row.order_no}: ${published.message}`)
    } catch (error) {
      result.errors.push(`${row.order_no}: ${(error as Error).message}`)
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
//  7. Dormancy (PRD §7.11.7)
// ─────────────────────────────────────────────────────────────────────────────

/** Archive orders awaiting customer input for 90 days. Restorable on request. */
export async function sweepDormancy(): Promise<SweepResult> {
  const result: SweepResult = { pass: 'dormancy', examined: 0, acted: 0, errors: [] }
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('commission_dormant')
    .select('order_id, order_no')
    .returns<{ order_id: string; order_no: string }[]>()
  if (error) {
    result.errors.push(error.message)
    return result
  }
  result.examined = data?.length ?? 0

  for (const row of data ?? []) {
    // Archived, never deleted — "unclaimed and abandoned orders accumulate
    // indefinitely" is the problem being solved, not "we need the disk back".
    const { error: archiveErr } = await supabase
      .from('card_orders')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', row.order_id)
      .is('archived_at', null)
    if (archiveErr) result.errors.push(`${row.order_no}: ${archiveErr.message}`)
    else result.acted++
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drain the notification outbox.
 *
 * Runs LAST in the sweep, deliberately: the passes above enqueue rows in the
 * same transaction as the state changes they make, so draining afterwards
 * means a reminder raised this run also goes out this run rather than waiting
 * for the next tick. On a daily cadence that is the difference between a
 * same-day and a next-day balance reminder.
 */
export async function sweepOutbox(): Promise<SweepResult> {
  const dispatched = await dispatchOutbox()
  return {
    pass: 'outbox',
    examined: dispatched.examined,
    acted: dispatched.sent,
    errors: [
      ...dispatched.errors,
      ...(dispatched.dead > 0
        ? [`${dispatched.dead} notification(s) gave up after retries — a customer was not reached`]
        : []),
    ],
  }
}

/** Run every pass. One failing pass never stops the others. */
export async function runAllSweeps(): Promise<SweepResult[]> {
  const passes = [
    sweepReconciliation,
    sweepAutoAssign,
    sweepAcceptSla,
    sweepAutoApprove,
    sweepBalanceChase,
    sweepForfeiture,
    sweepDelivery,
    sweepDormancy,
    sweepOutbox,
  ]

  const results: SweepResult[] = []
  for (const pass of passes) {
    try {
      results.push(await pass())
    } catch (error) {
      results.push({
        pass: pass.name,
        examined: 0,
        acted: 0,
        errors: [(error as Error).message],
      })
    }
  }
  return results
}
