import 'server-only'

import { renderEmail } from '@/lib/email-shell'
import { sendEmail } from '@/lib/email'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { readOrderTotals, type OrderLineItem } from '@/lib/cms/order-add-ons'
import { DESIGN_SLA_HOURS, designDueAt } from '@/lib/cms/design-sla'

// Tells the design team a paid card has landed and the 48h clock has started.
//
// Sent on finance approval, because that is the moment the promise is made to
// the couple — see design-sla.ts. Deliberately best-effort: a mail failure must
// never roll back a confirmed payment, so the caller catches and logs.

/**
 * Who hears about a new card.
 *
 * Mirrors editorial-recipients.ts: an explicit env list wins (useful for a
 * shared design inbox), otherwise fall back to dashboard staff who can edit
 * CMS content, since that is the permission the Card Designer itself requires.
 */
const DESIGNER_PERMISSIONS = ['cms.write', 'cms.publish'] as const

function parseEnvRecipients(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.includes('@'))
}

export async function resolveDesignRecipients(): Promise<string[]> {
  const fromEnv = parseEnvRecipients(process.env.DESIGN_NOTIFY_EMAIL)
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
          return DESIGNER_PERMISSIONS.some((p) => keys.includes(p))
        })
        .map((row) => (row.email as string)?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email && email.includes('@'))),
    ),
  ]
}

type OrderBriefRow = {
  ref: string
  items: OrderLineItem[] | null
  contact_name: string | null
  event_date: string | null
}

function formatDue(approvedAt: string): string {
  const due = designDueAt(approvedAt)
  if (!due) return `${DESIGN_SLA_HOURS} hours from now`
  // East Africa Time — where the team and the couples are.
  return due.toLocaleString('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    dateStyle: 'full',
    timeStyle: 'short',
  })
}

/**
 * Email the design team a brief for a newly approved order.
 *
 * Returns what happened rather than throwing, so the approval flow can log a
 * failure without failing the payment.
 */
export type DesignBriefArgs = {
  ref: string
  contactName: string | null
  eventDate: string | null
  approvedAt: string
  cardNames: string[]
  digitalCards: number
  printedCards: number
  adminBaseUrl: string
}

/** Pure render — no database, no sending. Shared by the sender and the preview. */
export function buildDesignBriefEmail(args: DesignBriefArgs): {
  subject: string
  text: string
  html: string
} {
  const { cardNames } = args
  const html = renderEmail({
    preheader: `${cardNames.length} card${cardNames.length === 1 ? '' : 's'} to design — due in ${DESIGN_SLA_HOURS}h`,
    eyebrow: 'Card Designer',
    heading: 'A new card is ready to design',
    referenceCode: args.ref,
    sections: [
      {
        kind: 'paragraph',
        text: `Payment for ${args.ref} has been approved${args.contactName ? ` for ${args.contactName}` : ''}. The ${DESIGN_SLA_HOURS}-hour design window has started.`,
      },
      {
        kind: 'detailRows',
        label: 'Order brief',
        rows: [
          { label: 'Cards to design', value: String(cardNames.length) },
          { label: 'Designs', value: cardNames.join(', ') || '—' },
          { label: 'Digital cards', value: args.digitalCards.toLocaleString('en-US') },
          {
            label: 'Printed cards',
            value: args.printedCards > 0 ? args.printedCards.toLocaleString('en-US') : 'None',
          },
          ...(args.eventDate ? [{ label: 'Event date', value: args.eventDate }] : []),
          { label: `Design due (${DESIGN_SLA_HOURS}h)`, value: formatDue(args.approvedAt) },
        ],
      },
      {
        kind: 'cta',
        href: `${args.adminBaseUrl}/opus-pass/digital-cards/designer`,
        label: 'Open the design queue',
      },
    ],
    closing:
      'Open the job to request any details you need from the couple, then submit the design before the deadline.',
    footerNote: 'You receive this because you have design access in the OpusFesta admin.',
  })

  return {
    subject: `New card to design — ${args.ref} (due in ${DESIGN_SLA_HOURS}h)`,
    text: `Payment ${args.ref} approved. ${cardNames.length} card(s) to design: ${cardNames.join(', ')}. ${args.digitalCards} digital, ${args.printedCards} printed. Due ${formatDue(args.approvedAt)}. ${args.adminBaseUrl}/opus-pass/digital-cards/designer`,
    html,
  }
}

export async function sendDesignBrief(
  orderId: string,
  approvedAt: string,
  adminBaseUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.opusfesta.com',
): Promise<{ sent: boolean; recipients: number; reason?: string }> {
  const recipients = await resolveDesignRecipients()
  if (recipients.length === 0) {
    return { sent: false, recipients: 0, reason: 'no_recipients' }
  }

  // Read the brief here rather than threading it through the approval action —
  // the payment row it works from doesn't carry line items.
  const supabase = createSupabaseAdminClient()
  const { data: order } = await supabase
    .from('invitation_orders')
    .select('ref, items, contact_name, event_date')
    .eq('id', orderId)
    .maybeSingle<OrderBriefRow>()
  if (!order) return { sent: false, recipients: recipients.length, reason: 'order_not_found' }

  const items = Array.isArray(order.items) ? order.items : []
  const totals = readOrderTotals(items)

  const { subject, text, html } = buildDesignBriefEmail({
    ref: order.ref,
    contactName: order.contact_name,
    eventDate: order.event_date,
    approvedAt,
    cardNames: items.map((i) => i.name ?? 'Untitled card'),
    digitalCards: totals.digitalCards,
    printedCards: totals.printedCards,
    adminBaseUrl,
  })

  const result = await sendEmail({ to: recipients, subject, html, text })

  return { sent: result.sent, recipients: recipients.length, reason: result.sent ? undefined : result.reason }
}
