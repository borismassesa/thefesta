import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'

/**
 * Tell the design team a couple has asked for a change.
 *
 * Every other notification in this pipeline runs staff-to-staff: finance
 * approving a payment briefs the designers, a designer submitting for review
 * emails a reviewer. Nothing ever travelled couple-to-staff, which is why
 * "message us if something still needs correcting" was the end of the road.
 *
 * Never throws. The request is already durable in
 * invitation_card_design_events by the time this runs; a mail outage must not
 * make the couple think their message was lost and send it four more times.
 */

/** Mirrors DESIGNER_PERMISSIONS in the admin's design-brief-email.ts. */
const DESIGN_PERMISSIONS = [
  'digitalcards.write',
  'digitalcards.publish',
  'cms.write',
  'cms.publish',
]

function parseEnvRecipients(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes('@'))
}

async function designTeamRecipients(): Promise<string[]> {
  // Same shared-inbox override the admin honours, so setting it once covers
  // both senders rather than only half of them.
  const fromEnv = parseEnvRecipients(process.env.DESIGN_NOTIFY_EMAIL)
  if (fromEnv.length > 0) return fromEnv

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('email, workforce_roles!dashboard_role_id(permission_keys)')
    .eq('dashboard_access', true)
  if (error || !data) return []

  return [
    ...new Set(
      (data as { email: string | null; workforce_roles: { permission_keys?: string[] } | null }[])
        .filter((row) => {
          const keys = row.workforce_roles?.permission_keys ?? []
          return DESIGN_PERMISSIONS.some((permission) => keys.includes(permission))
        })
        .map((row) => row.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email && email.includes('@'))),
    ),
  ]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function notifyChangeRequested(args: {
  designId: string
  cardName: string
  orderRef: string
  coupleEmail: string
  message: string
}): Promise<void> {
  try {
    const recipients = await designTeamRecipients()
    if (recipients.length === 0) return

    const adminBaseUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.opusfesta.com'
    const jobUrl = `${adminBaseUrl}/opus-pass/digital-cards/designer/${args.designId}`
    // The couple's own words are untrusted input rendered into HTML mail.
    const body = escapeHtml(args.message)

    await Promise.all(
      recipients.map((to) =>
        sendEmail({
          to,
          subject: `Change requested: ${args.cardName} (${args.orderRef})`,
          replyTo: args.coupleEmail,
          html: `
            <p>${escapeHtml(args.coupleEmail)} has asked for a change to a card that has already been released.</p>
            <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #C9A0DC;background:#FCF7FF;white-space:pre-wrap;">${body}</blockquote>
            <p>The card is unchanged and guests are still being served the released version. Open the job to decide whether to publish an update.</p>
            <p><a href="${jobUrl}">${jobUrl}</a></p>
          `,
          text: `${args.coupleEmail} has asked for a change to ${args.cardName} (${args.orderRef}).\n\n${args.message}\n\nThe card is unchanged. Open the job: ${jobUrl}`,
        }),
      ),
    )
  } catch (error) {
    console.error('[card-details] change-request notification failed', {
      designId: args.designId,
      error: error instanceof Error ? error.message : 'unknown',
    })
  }
}
