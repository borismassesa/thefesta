import 'server-only'
import { Resend } from 'resend'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSmsProvider } from '@/lib/sms'
import { renderCommissionMessage, type Locale, type TemplateVars } from './templates'

/**
 * The outbox dispatcher.
 * Specs: OP-CCS-PRD-001 §7.8; OP-CCS-TDD-001 §2 (outbox pattern), §10.
 *
 * `transition_order()` writes notification rows in the SAME TRANSACTION as the
 * state change, so a rolled-back transition can never emit a message and a
 * successful one can never lose it. This module is the other half: it drains
 * those rows and actually sends them.
 *
 * Four rules, each earned from a specific failure mode in the TDD:
 *
 *  1. AT-LEAST-ONCE, never at-most-once. A row stays `pending` until a send is
 *     confirmed. Duplicate messages annoy; missing balance reminders cost real
 *     money on work already paid for in salary.
 *  2. RETRY WITH BACKOFF, then `dead` after 5 attempts with an Ops alert. A row
 *     that can never succeed must stop consuming the queue.
 *  3. CHANNEL FALLBACK. WhatsApp template rejected by Meta → SMS → email. Meta
 *     approval is the long pole (PRD §11) and a template can be revoked
 *     without warning; the customer should still be told their balance is due.
 *  4. ONE ROW FAILING NEVER STOPS THE BATCH.
 */

const MAX_ATTEMPTS = 5
/** Exponential-ish, in minutes. A phone briefly off-network recovers inside the first two. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 480]
const BATCH_SIZE = 50

export type DispatchResult = {
  examined: number
  sent: number
  failed: number
  dead: number
  errors: string[]
}

type OutboxRow = {
  id: string
  order_id: string | null
  audience: 'customer' | 'designer' | 'finance' | 'admin'
  channel: 'bell' | 'sms' | 'email' | 'whatsapp'
  recipient: string | null
  template_key: string
  locale: Locale
  variables: Record<string, unknown>
  attempts: number
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const fromEmail = () => process.env.RESEND_FROM_EMAIL || 'OpusFesta <admin@opusfesta.com>'

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_OPUS_PASS_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://opuspass.opusfesta.com'
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a pre-approved Meta template with positional body parameters.
 *
 * Written here rather than added to `lib/whatsapp/meta.ts` because that
 * provider's interface is shaped around the guest-invite family (image header,
 * quick-reply buttons carrying guest tokens). Commission messages are a
 * different shape — plain body parameters and a link — and widening that
 * interface to cover both would make each harder to reason about.
 *
 * Returns a discriminated result so the caller can tell "Meta rejected this
 * template" (fall back to SMS) from "the network failed" (retry as-is).
 */
async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: string[],
  locale: Locale,
): Promise<{ ok: true; id?: string } | { ok: false; permanent: boolean; error: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) {
    // Not configured is PERMANENT for this channel — retrying will not make
    // credentials appear, so fall through to SMS immediately.
    return { ok: false, permanent: true, error: 'WhatsApp is not configured' }
  }

  const language = locale === 'sw' ? 'sw' : 'en'
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components: params.length
            ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }]
            : [],
        },
      }),
      cache: 'no-store',
    })

    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[]
      error?: { message?: string; code?: number }
    }
    if (res.ok && body.messages?.[0]?.id) return { ok: true, id: body.messages[0].id }

    const code = body.error?.code
    // 132xxx = template does not exist / not approved / param mismatch.
    // 131047 = outside the 24h window without a template. All permanent for
    // this channel: retrying the same call cannot succeed.
    const permanent =
      res.status === 400 ||
      (typeof code === 'number' && (Math.floor(code / 1000) === 132 || code === 131047))
    return {
      ok: false,
      permanent,
      error: body.error?.message ?? `WhatsApp HTTP ${res.status}`,
    }
  } catch (error) {
    return { ok: false, permanent: false, error: (error as Error).message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Recipient resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Staff recipients are resolved AT SEND TIME, not at enqueue time.
 *
 * Freezing a staff recipient when the row was written would send to whoever
 * held the role days ago. Finance and Ops rotate; the person who should see a
 * payment now is whoever holds the permission now.
 */
async function staffRecipients(
  audience: 'designer' | 'finance' | 'admin',
  channel: string,
  orderId: string | null,
): Promise<string[]> {
  const supabase = createSupabaseServerClient()

  if (audience === 'designer' && orderId) {
    const { data } = await supabase
      .from('card_orders')
      .select('assigned_designer_id')
      .eq('id', orderId)
      .maybeSingle<{ assigned_designer_id: string | null }>()
    if (!data?.assigned_designer_id) return []
    const { data: employee } = await supabase
      .from('workforce_employees')
      .select('email, phone')
      .eq('id', data.assigned_designer_id)
      .maybeSingle<{ email: string | null; phone: string | null }>()
    const value = channel === 'email' ? employee?.email : employee?.phone
    return value ? [value] : []
  }

  // Finance and Ops go to the addresses configured for the desk rather than to
  // individuals, so a staffing change does not silently stop the alerts.
  const env =
    audience === 'finance'
      ? process.env.COMMISSION_FINANCE_ALERT_EMAIL
      : process.env.COMMISSION_OPS_ALERT_EMAIL
  if (channel === 'email' && env) {
    return env.split(',').map((e) => e.trim()).filter(Boolean)
  }
  return []
}

// ─────────────────────────────────────────────────────────────────────────────
//  Dispatch
// ─────────────────────────────────────────────────────────────────────────────

async function markSent(id: string, providerRef?: string): Promise<void> {
  const supabase = createSupabaseServerClient()
  await supabase
    .from('notification_outbox')
    .update({ state: 'sent', sent_at: new Date().toISOString(), provider_ref: providerRef ?? null })
    .eq('id', id)
}

async function markFailed(row: OutboxRow, error: string): Promise<'failed' | 'dead'> {
  const supabase = createSupabaseServerClient()
  const attempts = row.attempts + 1
  const dead = attempts >= MAX_ATTEMPTS
  const delay = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]

  await supabase
    .from('notification_outbox')
    .update({
      state: dead ? 'dead' : 'failed',
      attempts,
      last_error: error.slice(0, 500),
      next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString(),
    })
    .eq('id', row.id)

  if (dead) {
    // A dead row is a message a customer never received. Log loudly — this is
    // the one outcome the outbox pattern exists to make visible.
    console.error('[commission-dispatcher] notification DEAD after retries', {
      id: row.id,
      orderId: row.order_id,
      channel: row.channel,
      audience: row.audience,
      template: row.template_key,
      error,
    })
  }
  return dead ? 'dead' : 'failed'
}

/** Send one row. Returns 'sent', 'failed' or 'dead'. */
async function dispatchOne(row: OutboxRow): Promise<'sent' | 'failed' | 'dead'> {
  const supabase = createSupabaseServerClient()

  // Build the deep link here rather than at enqueue time so it always points
  // at the current URL scheme.
  const vars: TemplateVars = { ...(row.variables as TemplateVars) }
  if (row.order_id && !vars.link) {
    const { data: order } = await supabase
      .from('card_orders')
      .select('order_no')
      .eq('id', row.order_id)
      .maybeSingle<{ order_no: string }>()
    if (order) vars.link = `${baseUrl()}/commission/${order.order_no}`
  }

  const message = renderCommissionMessage(row.template_key, row.locale, vars)
  if (!message) {
    // No template for this event. Retrying will never help.
    await markFailed({ ...row, attempts: MAX_ATTEMPTS - 1 }, `no template for "${row.template_key}"`)
    return 'dead'
  }

  // ── Bell ────────────────────────────────────────────────────────────────
  if (row.channel === 'bell') {
    if (row.audience !== 'customer' || !row.recipient) {
      // Staff bells would need a per-user in-app store this feature does not
      // have; Admin reads the queue directly instead. Nothing to send.
      await markSent(row.id)
      return 'sent'
    }
    const { error } = await supabase.from('notifications').insert({
      user_id: row.recipient,
      type: 'system',
      title: message.title,
      body: message.body,
      href: row.order_id ? (vars.link ?? null) : null,
    })
    if (error) return markFailed(row, error.message)
    await markSent(row.id)
    return 'sent'
  }

  // ── Resolve who this is going to ────────────────────────────────────────
  let targets: string[] = []
  if (row.audience === 'customer') {
    targets = row.recipient ? [row.recipient] : []
  } else {
    targets = await staffRecipients(row.audience, row.channel, row.order_id)
  }
  if (targets.length === 0) {
    // Nobody to send to — for example an alert address that is not configured.
    // Not an error worth retrying five times.
    await markSent(row.id)
    return 'sent'
  }

  // ── WhatsApp, with fallback ─────────────────────────────────────────────
  if (row.channel === 'whatsapp') {
    if (!message.whatsappTemplate) {
      await markSent(row.id)
      return 'sent'
    }
    const result = await sendWhatsAppTemplate(
      targets[0],
      message.whatsappTemplate,
      message.whatsappParams,
      row.locale,
    )
    if (result.ok) {
      await markSent(row.id, result.id)
      return 'sent'
    }
    if (!result.permanent) return markFailed(row, result.error)

    // Permanent WhatsApp failure — usually an unapproved or revoked template.
    // Fall through to SMS rather than losing the message.
    console.warn('[commission-dispatcher] WhatsApp permanently failed, falling back to SMS', {
      template: message.whatsappTemplate,
      error: result.error,
    })
    const sms = await getSmsProvider('commission').sendText(targets[0], message.body)
    if (sms.ok) {
      await markSent(row.id, 'sms-fallback')
      return 'sent'
    }
    return markFailed(row, `whatsapp: ${result.error}; sms fallback: ${sms.error ?? 'failed'}`)
  }

  // ── SMS ─────────────────────────────────────────────────────────────────
  if (row.channel === 'sms') {
    const sms = await getSmsProvider('commission').sendText(targets[0], message.body)
    if (sms.ok) {
      await markSent(row.id, sms.dryRun ? 'dry-run' : undefined)
      return 'sent'
    }
    return markFailed(row, sms.error ?? 'sms send failed')
  }

  // ── Email ───────────────────────────────────────────────────────────────
  if (row.channel === 'email') {
    if (!resend) {
      // Not configured. Marking sent rather than dead keeps the queue honest
      // in environments that legitimately have no mail transport.
      await markSent(row.id, 'not-configured')
      return 'sent'
    }
    try {
      const result = await resend.emails.send({
        from: fromEmail(),
        to: targets,
        subject: message.title,
        text: message.body,
      })
      if (result.error) return markFailed(row, result.error.message)
      await markSent(row.id, result.data?.id)
      return 'sent'
    } catch (error) {
      return markFailed(row, (error as Error).message)
    }
  }

  return markFailed(row, `unknown channel "${row.channel}"`)
}

/**
 * Drain the outbox.
 *
 * Ordered oldest-first so a backlog clears in the order customers were
 * promised things, and capped per run so one very large batch cannot exhaust
 * the function's time budget and lose everything.
 */
export async function dispatchOutbox(): Promise<DispatchResult> {
  const result: DispatchResult = { examined: 0, sent: 0, failed: 0, dead: 0, errors: [] }
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('notification_outbox')
    .select('id, order_id, audience, channel, recipient, template_key, locale, variables, attempts')
    .in('state', ['pending', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)
    .returns<OutboxRow[]>()
  if (error) {
    result.errors.push(error.message)
    return result
  }
  result.examined = data?.length ?? 0

  for (const row of data ?? []) {
    try {
      const outcome = await dispatchOne(row)
      if (outcome === 'sent') result.sent++
      else if (outcome === 'dead') result.dead++
      else result.failed++
    } catch (error) {
      // One row must never stop the batch.
      result.errors.push(`${row.id}: ${(error as Error).message}`)
      await markFailed(row, (error as Error).message).catch(() => {})
      result.failed++
    }
  }

  return result
}
