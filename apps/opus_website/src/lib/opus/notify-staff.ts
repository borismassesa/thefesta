import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import { isEmailConfigured, sendEmail } from '@/lib/email/email'
import { renderEmail, plaintextLines } from '@/lib/email/email-shell'

// Alerts support staff when a customer needs a human: email (Resend, reliable)
// plus a best-effort WhatsApp ping. Staff come from workforce_employees
// (dashboard_access), overridable via env allowlists. All best-effort: failures
// are swallowed so they never block the customer's chat.

const ADMIN_BASE = process.env.ADMIN_APP_URL ?? 'https://admin.opusfesta.com'

type StaffContact = { name: string; email: string; phone: string | null }

export async function resolveStaff(): Promise<StaffContact[]> {
  // Explicit allowlist wins (comma-separated emails).
  const envEmails = (process.env.SUPPORT_ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (envEmails.length > 0) {
    return envEmails.map((email) => ({ name: 'Support', email, phone: null }))
  }
  try {
    const sb = createSupabaseServerClient()
    const { data } = await sb
      .from('workforce_employees')
      .select('full_name, email, phone, status')
      .eq('dashboard_access', true)
      .eq('status', 'Active')
      .limit(10)
    return (data ?? [])
      .filter((r) => r.email)
      .map((r) => ({ name: r.full_name as string, email: r.email as string, phone: (r.phone as string) ?? null }))
  } catch {
    return []
  }
}

// Minimal Meta WhatsApp Cloud API freeform text send (best-effort). Freeform
// only delivers inside the 24h customer-service window; for reliable staff
// alerts an approved template is the production path. Env-gated, never throws.
async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) return
  const digits = to.replace(/[^\d]/g, '')
  if (!digits) return
  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: digits,
        type: 'text',
        text: { body: body.slice(0, 900) },
      }),
    })
  } catch {
    /* best-effort */
  }
}

export async function notifyStaffOfHandoff(input: {
  conversationId: string
  topic?: string | null
  reason?: string | null
  lastUserMessage?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  afterHours: boolean
  /** Set for the unattended-conversation nudge so the email reads as a reminder. */
  reminderMinutes?: number | null
}): Promise<void> {
  const staff = await resolveStaff()
  if (staff.length === 0) {
    // A customer is waiting and nobody can be paged. Loud on purpose: the fix
    // is either a workforce_employees row with dashboard_access, or the
    // SUPPORT_ALERT_EMAILS env allowlist.
    console.error(
      '[opus] handoff alert NOT sent: no support staff resolved. Set SUPPORT_ALERT_EMAILS or grant dashboard_access.',
      { conversationId: input.conversationId },
    )
    return
  }
  if (!isEmailConfigured()) {
    console.error('[opus] handoff alert NOT emailed: RESEND_API_KEY is missing.', {
      conversationId: input.conversationId,
    })
  }

  const link = `${ADMIN_BASE}/support/${input.conversationId}`
  const topic = input.topic && input.topic !== 'human_request' ? input.topic : 'a support request'
  const waiting = input.reminderMinutes
  const heading = waiting
    ? `Still waiting: a customer needs help (${topic})`
    : `A customer needs help (${topic})`
  const snippet = (input.lastUserMessage ?? '').slice(0, 300)

  const html = renderEmail({
    heading,
    preheader: 'Open the Support console to reply.',
    intro: waiting
      ? `Nobody has replied to this customer for ${waiting} minutes. Please pick it up.`
      : input.afterHours
        ? 'A customer asked for a person outside support hours. Please follow up when you can.'
        : 'A customer just asked to speak with a person on Opus.',
    rows: [
      { label: 'Topic', value: input.topic ?? 'general' },
      ...(input.reason ? [{ label: 'Reason', value: input.reason }] : []),
      ...(snippet ? [{ label: 'Message', value: snippet }] : []),
      ...(input.contactName ? [{ label: 'Name', value: input.contactName }] : []),
      ...(input.contactEmail ? [{ label: 'Email', value: input.contactEmail }] : []),
      ...(input.contactPhone ? [{ label: 'Phone', value: input.contactPhone }] : []),
    ],
    cta: { href: link, label: 'Open in Support console' },
    closing: 'You are receiving this because you have OpusFesta dashboard access.',
  })

  const text = plaintextLines([
    heading,
    '',
    snippet ? `Message: ${snippet}` : null,
    input.contactEmail ? `Email: ${input.contactEmail}` : null,
    input.contactPhone ? `Phone: ${input.contactPhone}` : null,
    '',
    `Open: ${link}`,
  ])

  const result = await sendEmail({
    to: staff.map((s) => s.email),
    subject: `[Opus] ${heading}`,
    html,
    text,
  }).catch((err) => ({ sent: false as const, reason: 'send_failed' as const, error: String(err) }))
  if (!result.sent) {
    console.error('[opus] handoff alert email failed:', result.reason, result.error ?? '', {
      conversationId: input.conversationId,
      recipients: staff.length,
    })
  }

  const waBody = `OpusFesta: a customer needs support (${input.topic ?? 'general'}).${
    snippet ? `\n"${snippet}"` : ''
  }\nReply here: ${link}`
  await Promise.all(
    staff.filter((s) => s.phone).map((s) => sendWhatsAppText(s.phone as string, waBody)),
  )
}
