import 'server-only'
import { createDashboardClient } from '@/lib/dashboard/supabase'
import { eatDateParts, formatLongDate } from '@/lib/dashboard/share'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { getLocale } from '@/lib/cms/locale'
import type { CheckinReportData, CheckinReportRow } from '@/lib/checkin-report-pdf'

/**
 * Server-side assembly of the check-in report.
 *
 * Every figure here used to be computed in the browser and POSTed to
 * /api/checkin-report, which rendered whatever it was handed. That made the
 * couple's own report a claim by their browser rather than a statement by the
 * server, and let any unauthenticated caller render an OpusPass-branded PDF
 * listing names of their choosing. Nothing outside this file decides what the
 * report says.
 *
 * Caller MUST have already verified that `eventId` belongs to `userId`
 * (resolveOwnedEventId). Every query below is scoped by both, so a mismatch
 * returns null rather than another couple's guests, but that is a backstop and
 * not the authorization check.
 */

/** All OpusFesta events are Tanzanian, so a guest arrived at the wall-clock
 *  time their hosts would name. The browser used to format these from its own
 *  locale, which is how the 7 August report printed three morning arrivals
 *  (10:52, 9:14, 8:00 EAT) as 12:52 AM, 11:14 PM and 10:00 PM — it was
 *  downloaded from a UTC-7 machine. Vercel runs in UTC, so the zone has to be
 *  forced here rather than inherited from anywhere. */
function formatArrivalClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const { hour, minute } = eatDateParts(d)
  const suffix = hour < 12 ? 'AM' : 'PM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:${String(minute).padStart(2, '0')} ${suffix}`
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "7 August 2026 at 1:08 AM", EAT, for the report's own provenance line. */
function formatGeneratedAt(d: Date): string {
  const { day, month, year, hour, minute } = eatDateParts(d)
  const suffix = hour < 12 ? 'AM' : 'PM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${day} ${MONTHS[month - 1]} ${year} at ${twelve}:${String(minute).padStart(2, '0')} ${suffix}`
}

interface InvitationRow {
  id: string
  guest_contact_id: string
  party_size: number | null
  entry_allowance: number | null
  checked_in_count: number | null
  checked_in_at: string | null
  checked_in_by: string | null
  checked_in_door: string | null
  pass_id: string | null
}

/**
 * The attendant's display name, recovered from the audit label the scanner
 * writes: "Asha (Main Gate) [credential] (manual: ...)". Only the leading name
 * is shown — the door is already its own column, and the identifier type and
 * manual reason are operational detail the couple's copy does not carry.
 *
 * A label that does not match the shape is surfaced whole rather than guessed
 * at. This parse disappears once the admission fields are promoted to real
 * columns (docs/CHECKIN_REPORT_TEMPLATES_SPEC.md section 7.1).
 */
function attendantNameFrom(label: string | null): string | null {
  const trimmed = label?.trim()
  if (!trimmed) return null
  return trimmed.split(' (')[0]?.trim() || trimmed
}

export async function buildCheckinReportData(
  userId: string,
  eventId: string,
): Promise<CheckinReportData | null> {
  const supabase = createDashboardClient()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('id, name, starts_at, venue_name, city')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle<{
      id: string
      name: string | null
      starts_at: string | null
      venue_name: string | null
      city: string | null
    }>()
  if (!event) return null

  const { data: invitationRows, error: invErr } = await supabase
    .from('guest_invitations')
    .select(
      'id, guest_contact_id, party_size, entry_allowance, checked_in_count, checked_in_at, checked_in_by, checked_in_door, pass_id',
    )
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('rsvp_status', 'attending')
  if (invErr) throw new Error(invErr.message)

  const invitations = (invitationRows ?? []) as InvitationRow[]
  const guestIds = invitations.map((i) => i.guest_contact_id)

  // Names, and the seating table an usher would send an arrival to. Both are
  // keyed by guest_contact_id, so both are skipped entirely when nobody has
  // RSVP'd yet rather than issuing an `.in('id', [])`.
  const [{ data: contacts }, { data: assignments }, strings] = await Promise.all([
    guestIds.length
      ? supabase
          .from('guest_contacts')
          .select('id, full_name, max_party_size, review_status')
          .eq('user_id', userId)
          .in('id', guestIds)
      : Promise.resolve({ data: [] as unknown[] }),
    guestIds.length
      ? supabase
          .from('seating_assignments')
          .select('guest_contact_id, seating_tables(name)')
          .eq('user_id', userId)
          .eq('event_id', eventId)
      : Promise.resolve({ data: [] as unknown[] }),
    loadUiStrings('dashboard-send', await getLocale()),
  ])

  const contactById = new Map<
    string,
    { full_name: string | null; max_party_size: number | null; review_status: string | null }
  >()
  for (const c of (contacts ?? []) as {
    id: string
    full_name: string | null
    max_party_size: number | null
    review_status: string | null
  }[]) {
    contactById.set(c.id, c)
  }

  const tableByGuest = new Map<string, string>()
  for (const a of (assignments ?? []) as {
    guest_contact_id: string
    seating_tables: { name: string } | null
  }[]) {
    if (a.seating_tables?.name) tableByGuest.set(a.guest_contact_id, a.seating_tables.name)
  }

  const rows: CheckinReportRow[] = []
  let totalArrived = 0

  for (const inv of invitations) {
    const contact = contactById.get(inv.guest_contact_id)
    // A public self-RSVP awaiting the couple's review is not yet a guest. The
    // dashboard roster filters these out, so the report must too or the two
    // would disagree on the guest count.
    if (!contact || contact.review_status === 'unconfirmed') continue

    const admittedSeats = inv.checked_in_count ?? 0
    const arrived = Boolean(inv.checked_in_at)
    if (arrived) totalArrived += 1

    // Seats actually admitted when known, else what they RSVP'd for, else the
    // capacity their invitation was issued with. Mirrors the label the console
    // shows, so the printout and the screen never disagree on Single/Double.
    const seats =
      admittedSeats > 0
        ? admittedSeats
        : inv.party_size ?? inv.entry_allowance ?? contact.max_party_size ?? 1

    rows.push({
      name: contact.full_name?.trim() || 'Guest',
      passId: inv.pass_id,
      ticket: seats >= 2 ? strings.party_double : strings.party_single,
      table: tableByGuest.get(inv.guest_contact_id) ?? null,
      door: arrived ? inv.checked_in_door : null,
      attendant: arrived ? attendantNameFrom(inv.checked_in_by) : null,
      arrivedAt: inv.checked_in_at ? formatArrivalClock(inv.checked_in_at) : null,
    })
  }

  return {
    eventName: event.name?.trim() || 'Event',
    eventDate: formatLongDate(event.starts_at) || null,
    venue: [event.venue_name, event.city].filter(Boolean).join(', ') || null,
    generatedAt: formatGeneratedAt(new Date()),
    totalAttending: rows.length,
    totalArrived,
    rows,
  }
}
