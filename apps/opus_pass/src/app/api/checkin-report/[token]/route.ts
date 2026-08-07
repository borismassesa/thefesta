import { NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { CheckinReportPdf, type CheckinReportData } from '@/lib/checkin-report-pdf'
import { createSupabaseServerClient } from '@/lib/supabase'
import { verifyReportToken } from '@/lib/checkin/tokens'
import { clientIp, withinRateLimit } from '@/lib/checkin/rate-limit'

/**
 * The check-in report as a PDF, for a link minted by /api/checkin/report-link.
 *
 * The same document the couple downloads from their dashboard, rendered from
 * the same component — that is the whole point of this route existing. The
 * scanner used to build its own plain-text summary, so the report an attendant
 * handed over at the end of the night and the report the couple downloaded
 * were two different documents describing the same event.
 *
 * Unlike the dashboard's POST route, the rows are read here rather than
 * accepted from the caller. A door device is further from the couple's own
 * session than a browser tab is, and a report is evidence: what it says
 * happened should come from what the database recorded, not from what the
 * device asking for it claims.
 */

export const runtime = 'nodejs'

/** Tanzanian local time — the wall clock the door actually worked to. */
const EVENT_TIME_ZONE = 'Africa/Dar_es_Salaam'

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: EVENT_TIME_ZONE,
  })
}

/** Strip the audit label down to the attendant's name, as the arrivals log does. */
function attendantOf(checkedInBy: string | null): string | null {
  if (!checkedInBy) return null
  const name = checkedInBy
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .trim()
  return name || null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  // Expiry is enforced inside verify, so a stale link is indistinguishable
  // from a forged one — neither says whether the event exists.
  const payload = verifyReportToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'This report link is no longer valid' }, { status: 401 })
  }

  const supabase = createSupabaseServerClient()

  // Same cap the dashboard's own report route applies, and for the same
  // reason: this renders a PDF, which is CPU the whole app shares. A link
  // that is meant to be opened once is worth nothing to its holder at fifty
  // times a second, and the token deliberately outlives a single fetch so it
  // can be retried on a bad venue connection.
  if (!(await withinRateLimit(supabase, `checkin-report:${clientIp(request)}`, 20, 60))) {
    return NextResponse.json(
      { error: 'Too many requests — wait a moment and try again' },
      { status: 429 }
    )
  }

  const { data: event } = await supabase
    .from('wedding_events')
    .select('name, venue_name, starts_at')
    .eq('id', payload.eventId)
    .maybeSingle()

  const { data: invitations, error } = await supabase
    .from('guest_invitations')
    .select(
      'guest_contact_id, pass_id, party_size, checked_in_at, checked_in_party_size, checked_in_door, checked_in_by, guest_contacts(full_name)'
    )
    .eq('event_id', payload.eventId)
    .eq('rsvp_status', 'attending')

  if (error) {
    console.error('[api/checkin-report] roster read failed', error)
    return NextResponse.json({ error: 'Could not build the report' }, { status: 503 })
  }

  const { data: seatAssignments } = await supabase
    .from('seating_assignments')
    .select('guest_contact_id, seating_tables(name)')
    .eq('event_id', payload.eventId)
  const tableByGuest = new Map<string, string>()
  for (const a of seatAssignments ?? []) {
    const table = a.seating_tables as unknown as { name: string } | null
    if (table?.name) tableByGuest.set(a.guest_contact_id as string, table.name)
  }

  const rows = (invitations ?? [])
    .map((inv) => {
      const contact = inv.guest_contacts as unknown as { full_name: string } | null
      const heads = inv.checked_in_party_size ?? inv.party_size ?? 1
      return {
        name: contact?.full_name ?? 'Guest',
        passId: inv.pass_id,
        // Same wording the tickets are sold in, matching the dashboard.
        ticket: heads >= 2 ? 'Double' : 'Single',
        table: tableByGuest.get(inv.guest_contact_id as string) ?? null,
        door: inv.checked_in_at ? inv.checked_in_door : null,
        attendant: inv.checked_in_at ? attendantOf(inv.checked_in_by) : null,
        arrivedAt: inv.checked_in_at ? clock(inv.checked_in_at) : null,
      }
    })
    // Arrived first, in the order they came through, then everyone still out.
    .sort((a, b) => {
      if (Boolean(a.arrivedAt) !== Boolean(b.arrivedAt)) return a.arrivedAt ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  const data: CheckinReportData = {
    eventName: event?.name ?? 'Event',
    eventDate: event?.starts_at
      ? new Date(event.starts_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: EVENT_TIME_ZONE,
        })
      : null,
    venue: event?.venue_name ?? null,
    generatedAt: new Date().toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: EVENT_TIME_ZONE,
    }),
    totalAttending: rows.length,
    totalArrived: rows.filter((r) => r.arrivedAt).length,
    rows,
  }

  try {
    const pdf = await renderToBuffer(
      createElement(CheckinReportPdf, { data }) as ReactElement<DocumentProps>
    )
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // Inline, not attachment: this opens in the phone's viewer, where the
        // attendant shares or saves it with the controls they already know.
        'Content-Disposition': 'inline; filename="OpusPass-Checkin-Report.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[api/checkin-report] PDF render failed', err)
    return NextResponse.json({ error: 'Could not generate the check-in report' }, { status: 500 })
  }
}
