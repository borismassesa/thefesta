/**
 * The invite & delivery report's data contract and every derivation it needs.
 *
 * Split out of invite-report-pdf.tsx on purpose. The document file imports
 * @react-pdf/renderer, and the test runner only picks up `.test.ts` (see the
 * `test` script in package.json), so anything living beside the JSX is
 * effectively untestable — which is why checkin-report-pdf.tsx's label and
 * percentage logic has never had a single assertion on it. Labels, ordering and
 * the credit arithmetic are the parts that can quietly go wrong on a document
 * nobody re-reads, so they live here where a test can reach them.
 *
 * Pure by construction: no react-pdf import, no I/O, no clock.
 */

/** What WhatsApp did with a guest's most recent invitation for this event.
 *  Mirrors SendGuestRow['delivery']['state'] in lib/dashboard/queries.ts. */
export type InviteDeliveryState = 'pending' | 'delivered' | 'read' | 'failed'

export type InviteRsvp = 'attending' | 'declined' | 'maybe' | 'none'

export interface InviteReportRow {
  name: string
  /** The number the invitation actually goes to, so a couple chasing a failed
   *  row can dial it straight off the page. The WhatsApp number when there is
   *  one, since that is also what picks `channel`. Null when the guest has no
   *  number at all, which is itself why they were never sent to. */
  phone: string | null
  channel: 'whatsapp' | 'sms'
  /** Null when there is no WhatsApp invite row at all for this guest: never
   *  sent, shared by hand, or a send that predates event scoping. */
  delivery: InviteDeliveryState | null
  /** Already resolved to plain English by describeDeliveryFailure(). Only
   *  meaningful alongside `delivery: 'failed'`. */
  failureReason: string | null
  /** Something was logged as sent for this event, but WhatsApp never gave us a
   *  receipt for it: a wa.me or SMS share through recordSend(). */
  sharedByHand: boolean
  /** Pre-formatted local stamp, e.g. "7 Aug, 04:12 PM". Null when nothing has
   *  ever gone to this guest for this event. Formatted by the caller because
   *  the render route runs on a UTC server and only the browser knows the
   *  couple's timezone. */
  sentAt: string | null
  rsvp: InviteRsvp
  /** Seats confirmed at RSVP. Null unless `rsvp` is 'attending'. */
  partySize: number | null
}

/**
 * Plain counts in, every sentence derived here.
 *
 * The caller passes the funnel and credit numbers exactly as the console holds
 * them (SendInvitesData.funnel and .quota) and nothing else — no totals, no
 * percentages, no remaining balance. Same contract as CheckinReportData: the
 * document can't be handed arithmetic that disagrees with itself.
 */
export interface InviteReportData {
  eventName: string
  eventDate: string | null
  venue: string | null
  /** Pre-formatted "7 August 2026 at 04:12 PM". */
  generatedAt: string
  invited: number
  delivered: number
  undelivered: number
  viewed: number
  responded: number
  creditsUsed: number
  creditsPurchased: number
  rows: InviteReportRow[]
}

export function channelLabel(channel: InviteReportRow['channel']): string {
  return channel === 'whatsapp' ? 'WhatsApp' : 'SMS'
}

/**
 * What the delivery column says.
 *
 * The four WhatsApp states mirror the console's own labels (delivery_* in
 * ui-strings-fallback.ts), which are CMS-editable there and hardcoded here —
 * the same split checkin-report-pdf.tsx makes. The two extra states have no
 * console equivalent: a guest with no WhatsApp row is either untouched or was
 * shared with by hand, and the report is the only surface that tells them
 * apart.
 */
export function deliveryLabel(row: InviteReportRow): string {
  switch (row.delivery) {
    case 'failed':
      return 'Not delivered'
    case 'read':
      return 'Opened'
    case 'delivered':
      return 'Delivered'
    case 'pending':
      return 'Awaiting'
    default:
      return row.sharedByHand ? 'Shared by hand' : 'Not sent'
  }
}

/** True only for a refused delivery. Deliberately NOT true for "Not sent" — on
 *  a list where nothing has gone out yet, every row would otherwise print as an
 *  alarm. */
export function isProblemRow(row: InviteReportRow): boolean {
  return row.delivery === 'failed'
}

/**
 * The RSVP column, carrying the ticket the guest is coming on.
 *
 * `>= 2`, not `=== 2`: writes clamp party size to MAX_TICKET_PARTY but reads
 * only floor it at 1, so a legacy row holding 3 must still read as a Double
 * rather than falling through to Single. Matches ticketLabelOf in
 * SendInvitesView.tsx.
 */
export function rsvpLabel(row: InviteReportRow): string {
  switch (row.rsvp) {
    case 'attending': {
      if (row.partySize == null) return 'Attending'
      return row.partySize >= 2 ? 'Attending, Double' : 'Attending, Single'
    }
    case 'declined':
      return 'Declined'
    case 'maybe':
      return 'Maybe'
    default:
      return 'No reply yet'
  }
}

/**
 * The credit band's numbers.
 *
 * `overdrawn` is a real state, not a guard against a bug: a refunded order
 * removes purchased capacity that has already been spent, so used can exceed
 * purchased. The bar is capped at 100% so it can't overflow its track, and the
 * separate flag is what colours it.
 */
export function creditSummary(
  used: number,
  purchased: number,
): { remaining: number; pct: number; overdrawn: boolean } {
  return {
    remaining: Math.max(0, purchased - used),
    pct: purchased > 0 ? Math.min(100, Math.round((used / purchased) * 100)) : 0,
    overdrawn: used > purchased,
  }
}

/**
 * Reading order: the rows that need doing, then the rest.
 *
 * Refused deliveries first (someone has to be chased), then guests nobody has
 * sent to yet, then everyone else alphabetically. A straight A-Z register would
 * bury the six failures in a 200-row list, which is the one thing this document
 * exists to surface.
 *
 * Returns a new array — the caller's source is React state.
 */
export function sortInviteRows(rows: InviteReportRow[]): InviteReportRow[] {
  const bucket = (r: InviteReportRow) => (isProblemRow(r) ? 0 : r.sentAt === null ? 1 : 2)
  return [...rows].sort((a, b) => bucket(a) - bucket(b) || a.name.localeCompare(b.name))
}
