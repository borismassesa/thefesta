import 'server-only'

import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { escapeHtml, renderEmail } from '@/lib/email-shell'

// Telling a reviewer a card is waiting for them.
//
// Email is the only staff channel that exists. The `notifications` table is
// keyed to `public.users` and read by the OpusPass navbar bell, so it reaches
// couples only; there is no staff bell anywhere in the admin. Until there is,
// a card sitting in review is invisible unless somebody is emailed.
//
// Split the same way as design-brief-email.ts: a pure builder the email-preview
// gallery can render without a database, and a sender that never throws.

/**
 * Reviewers are whoever may RELEASE a card, which is now its own key.
 *
 * Both spellings, for the length of the migration: a role still on cms.publish
 * reaches the release gate through the compatibility expansion and must keep
 * being asked to review, while a role moved fully onto digitalcards.publish
 * holds no cms key at all and would otherwise never be told a card is waiting.
 * A review request that reaches nobody leaves a finished card sitting in the
 * queue, which is the failure this email exists to prevent.
 *
 * Still deliberately narrower than the designer list: the publish key is what
 * separates a reviewer from a designer, and that separation is the whole point
 * of the review step.
 */
const REVIEWER_PERMISSIONS = ['digitalcards.publish', 'cms.publish']

function parseEnvRecipients(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.includes('@'))
}

/** Staff who may approve a card. Env override wins, as with every other notifier here. */
export async function resolveCardReviewers(): Promise<string[]> {
  const fromEnv = parseEnvRecipients(process.env.CARD_REVIEW_NOTIFY_EMAIL)
  if (fromEnv.length > 0) return fromEnv
  if (!hasSupabaseAdminConfig()) return []

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('email, workforce_roles!dashboard_role_id(permission_keys)')
    .eq('dashboard_access', true)
  if (error || !data) return []

  return [
    ...new Set(
      data
        .filter((row) => {
          const keys: string[] =
            (row.workforce_roles as { permission_keys?: string[] } | null)?.permission_keys ?? []
          return REVIEWER_PERMISSIONS.some((p) => keys.includes(p))
        })
        .map((row) => (row.email as string)?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email && email.includes('@'))),
    ),
  ]
}

export type CardReviewArgs = {
  designId: string
  cardName: string
  orderRef: string
  coupleName: string | null
  eventDate: string | null
  submittedBy: string
  fieldsFilled: number
  fieldsTotal: number
  adminBaseUrl: string
}

/** Pure render — no database, no sending. Shared by the sender and the preview. */
export function buildCardReviewEmail(args: CardReviewArgs): {
  subject: string
  text: string
  html: string
} {
  const who = args.coupleName ? ` for ${args.coupleName}` : ''
  const reviewUrl = `${args.adminBaseUrl}/opus-pass/digital-cards/designer/${args.designId}`

  const html = renderEmail({
    preheader: `${args.cardName} is finished and needs a second pair of eyes`,
    eyebrow: 'Personalisation Queue',
    heading: 'A card is ready for review',
    referenceCode: args.orderRef,
    sections: [
      {
        // `paragraph.text` is injected UNESCAPED by renderEmail, and every value
        // here is typed by a customer or a colleague.
        kind: 'paragraph',
        text: `${escapeHtml(args.submittedBy)} has finished <strong>${escapeHtml(args.cardName)}</strong>${escapeHtml(who)} and submitted it for review. It will not reach the couple until someone approves it.`,
      },
      {
        kind: 'detailRows',
        label: 'The card',
        rows: [
          { label: 'Design', value: args.cardName },
          { label: 'Order', value: args.orderRef },
          ...(args.coupleName ? [{ label: 'Couple', value: args.coupleName }] : []),
          ...(args.eventDate ? [{ label: 'Event date', value: args.eventDate }] : []),
          { label: 'Details supplied', value: `${args.fieldsFilled} of ${args.fieldsTotal}` },
          { label: 'Submitted by', value: args.submittedBy },
        ],
      },
      { kind: 'cta', href: reviewUrl, label: 'Review this card' },
    ],
    closing:
      'Check the names, the date and the venue against what the couple sent. Approving publishes the card to their dashboard, and a wedding invitation cannot be recalled.',
    footerNote: 'You receive this because you can release cards in the OpusFesta admin.',
  })

  return {
    subject: `Card ready for review — ${args.cardName} (${args.orderRef})`,
    text: `${args.submittedBy} submitted ${args.cardName}${who} for review. Order ${args.orderRef}. ${args.fieldsFilled} of ${args.fieldsTotal} details supplied. Review: ${reviewUrl}`,
    html,
  }
}

/**
 * Email every reviewer that a card is waiting.
 *
 * Never throws, and reports why nobody was reached, so the caller can tell the
 * designer "submitted, but tell someone directly" instead of implying an alert
 * went out.
 */
export async function sendCardReviewRequest(
  designId: string,
  adminBaseUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.opusfesta.com',
): Promise<{ sent: boolean; recipients: string[]; reason?: string }> {
  const recipients = await resolveCardReviewers()
  if (recipients.length === 0) return { sent: false, recipients: [], reason: 'no_recipients' }

  const supabase = createSupabaseAdminClient()
  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select('id, order_id, product_name, field_values, requested_fields, submitted_by')
    .eq('id', designId)
    .maybeSingle<{
      id: string
      order_id: string
      product_name: string
      field_values: Record<string, string> | null
      requested_fields: string[] | null
      submitted_by: string
    }>()
  if (!design) return { sent: false, recipients, reason: 'design_not_found' }

  const { data: order } = await supabase
    .from('invitation_orders')
    .select('ref, contact_name, event_date')
    .eq('id', design.order_id)
    .maybeSingle<{ ref: string; contact_name: string | null; event_date: string | null }>()

  const values = design.field_values ?? {}
  const filled = Object.values(values).filter((v) => String(v ?? '').trim()).length

  const { subject, text, html } = buildCardReviewEmail({
    designId: design.id,
    cardName: design.product_name || 'Untitled card',
    orderRef: order?.ref ?? '',
    coupleName: order?.contact_name ?? null,
    eventDate: order?.event_date ?? null,
    submittedBy: design.submitted_by || 'A designer',
    fieldsFilled: filled,
    fieldsTotal: Math.max(filled, Object.keys(values).length),
    adminBaseUrl,
  })

  const result = await sendEmail({ to: recipients, subject, html, text })
  return { sent: result.sent, recipients, reason: result.sent ? undefined : result.reason }
}
