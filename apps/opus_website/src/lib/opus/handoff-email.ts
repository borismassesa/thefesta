import { renderEmail, plaintextLines, type BadgeTone } from '@/lib/email/email-shell'

// Builds the "a customer needs a person" staff alert. Pure on purpose: kept out
// of notify-staff.ts (which is `server-only`) so it can be rendered in a
// preview script and asserted in tests without pulling in Supabase or Resend.

export type HandoffEmailInput = {
  conversationId: string
  adminBaseUrl: string
  topic?: string | null
  reason?: string | null
  lastUserMessage?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  afterHours: boolean
  /** Set for the unattended-conversation nudge so the email reads as a reminder. */
  reminderMinutes?: number | null
}

// The guardrail topics are snake_case internal keys; staff read the email.
const TOPIC_LABELS: Record<string, string> = {
  refund: 'Refund',
  cancellation: 'Cancellation',
  payment: 'Payment',
  complaint: 'Complaint',
  account: 'Account',
  human_request: 'Human request',
}

export function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export function buildHandoffEmail(input: HandoffEmailInput): {
  subject: string
  html: string
  text: string
  link: string
} {
  const link = `${input.adminBaseUrl}/support/${input.conversationId}`
  const waiting = input.reminderMinutes
  const heading = waiting ? 'A customer is still waiting' : 'A customer needs a person'
  const snippet = (input.lastUserMessage ?? '').slice(0, 300)
  const topicLabel = TOPIC_LABELS[input.topic ?? ''] ?? input.topic ?? 'General'

  // The pill carries the urgency so the heading can stay plain language: how
  // long someone has been ignored is what decides who picks it up.
  const badge: { label: string; tone: BadgeTone } = waiting
    ? { label: `Waiting ${formatWait(waiting)}`, tone: waiting >= 60 ? 'negative' : 'warning' }
    : { label: input.afterHours ? 'After hours' : 'New request', tone: 'info' }

  const html = renderEmail({
    heading,
    eyebrow: 'Support alert',
    preheader: `${topicLabel} · ${snippet || 'Open the Support console to reply.'}`,
    badge,
    intro: waiting
      ? `Nobody has replied for <strong>${formatWait(waiting)}</strong>. Please pick this up in the Support console.`
      : input.afterHours
        ? 'A customer asked for a person outside support hours. Please follow up when we reopen.'
        : 'A customer just asked to speak with a person on Opus.',
    quote: snippet || undefined,
    rows: [
      { label: 'Topic', value: topicLabel },
      ...(input.reason ? [{ label: 'Reason', value: input.reason }] : []),
      ...(input.contactName ? [{ label: 'Name', value: input.contactName }] : []),
      ...(input.contactEmail ? [{ label: 'Email', value: input.contactEmail }] : []),
      ...(input.contactPhone ? [{ label: 'Phone', value: input.contactPhone }] : []),
    ],
    cta: { href: link, label: 'Reply in Support console' },
    footerNote: 'You receive these because you have OpusFesta dashboard access.',
  })

  const text = plaintextLines([
    heading,
    waiting ? `Waiting ${formatWait(waiting)}` : null,
    '',
    `Topic: ${topicLabel}`,
    snippet ? `Message: "${snippet}"` : null,
    input.contactName ? `Name: ${input.contactName}` : null,
    input.contactEmail ? `Email: ${input.contactEmail}` : null,
    input.contactPhone ? `Phone: ${input.contactPhone}` : null,
    '',
    `Reply: ${link}`,
  ])

  // Subject carries the topic and the wait so a phone lock screen is enough to
  // triage it without opening the mail.
  const subject = waiting
    ? `[Opus] ${topicLabel} waiting ${formatWait(waiting)}`
    : `[Opus] New ${topicLabel.toLowerCase()} needs attention`

  return { subject, html, text, link }
}
