import { NextResponse, type NextRequest } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { CheckinReportPdf } from '@/lib/checkin-report-pdf'
import { buildCheckinReportData } from '@/lib/checkin/report-data'
import { getDashboardUser } from '@/lib/dashboard/auth'
import { resolveOwnedEventId } from '@/lib/dashboard/queries'
import { createSupabaseServerClient } from '@/lib/supabase'
import { clientIp, withinRateLimit, RATE_LIMITED_RESPONSE } from '@/lib/checkin/rate-limit'

export const runtime = 'nodejs'

// The report names real guests, so the request carries an event id and nothing
// else. This route used to accept the entire report as a JSON body and render
// it verbatim, with no auth: any caller could produce an OpusPass-branded PDF
// listing names of their choosing, and a couple's own figures were whatever
// their browser happened to send. Every number now comes from the database,
// for an event the signed-in couple is verified to own.
const MAX_BODY_BYTES = 4 * 1024

export async function POST(req: NextRequest) {
  const user = await getDashboardUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rendering a PDF is CPU-bound, so it stays rate limited even now that the
  // caller must be signed in. Keyed by user as well as IP: one couple behind a
  // shared NAT should not be able to throttle another's downloads.
  const supabase = createSupabaseServerClient()
  if (!(await withinRateLimit(supabase, `checkin-report:${user.id}:${clientIp(req)}`, 20, 60))) {
    return NextResponse.json(RATE_LIMITED_RESPONSE, { status: 429 })
  }

  // Enforce the cap on bytes actually received, not the client-supplied
  // Content-Length header, which a non-browser caller can understate.
  let raw: string
  try {
    raw = await req.text()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const eventId = (body as { eventId?: unknown } | null)?.eventId
  if (typeof eventId !== 'string' || !eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
  }

  // Ownership, not merely authentication: a signed-in couple must not be able
  // to render another couple's guest list by swapping the id.
  const ownedEventId = await resolveOwnedEventId(user.id, eventId)
  if (!ownedEventId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  try {
    const data = await buildCheckinReportData(user.id, ownedEventId)
    if (!data) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const pdf = await renderToBuffer(
      createElement(CheckinReportPdf, { data }) as ReactElement<DocumentProps>,
    )
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="OpusPass-Checkin-Report.pdf"',
        // Names a real guest list; must never sit in a shared cache.
        'Cache-Control': 'no-store, private',
      },
    })
  } catch (err) {
    console.error('[api/checkin-report] PDF render failed', err)
    return NextResponse.json({ error: 'Could not generate the check-in report' }, { status: 500 })
  }
}
