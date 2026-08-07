import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { candidateScannerAccessHashes, signReportToken } from '@/lib/checkin/tokens'
import { clientIp, withinRateLimit } from '@/lib/checkin/rate-limit'

/**
 * Exchange a scanner access token for a short-lived link to that event's
 * check-in report.
 *
 * Exists because a PDF is opened, not posted. The scanner needs to hand a URL
 * to a browser, and the alternative — putting the attendant's own access
 * token in that URL — would leave a working door credential in browser
 * history, in any screenshot of the address bar, and in whatever the
 * attendant shares the download to. This mints something narrower instead:
 * one event, one report, ten minutes, no ability to admit anybody.
 */

/** Long enough to survive a slow venue connection, short enough to be useless later. */
const LINK_TTL_MS = 10 * 60 * 1000

export async function POST(request: NextRequest) {
  const { eventId, token } = (await request.json().catch(() => ({}))) as {
    eventId?: string
    token?: string
  }
  if (!eventId || !token) {
    return NextResponse.json({ ok: false, error: 'Missing eventId or token' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()

  // Tighter than /validate: a report is an occasional, deliberate action, so
  // there is no legitimate reason for a device to ask often.
  if (!(await withinRateLimit(supabase, `report-link:${clientIp(request)}`, 20, 60))) {
    return NextResponse.json(
      { ok: false, error: 'Too many attempts — wait a moment and try again' },
      { status: 429 }
    )
  }

  // Same gate the roster itself passes through. A revoked or expired code must
  // not be able to mint a link that outlives it, which is why this is checked
  // here at exchange time rather than trusted from the app.
  const { data: row, error } = await supabase
    .from('scanner_access_tokens')
    .select('id, event_id, expires_at, revoked_at')
    .in('token_hash', candidateScannerAccessHashes(token))
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: 'Lookup failed' }, { status: 500 })
  if (!row) return NextResponse.json({ ok: false, error: 'Invalid code' }, { status: 401 })
  if (row.revoked_at) {
    return NextResponse.json({ ok: false, error: 'This code has been revoked' }, { status: 401 })
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: 'This code has expired' }, { status: 401 })
  }

  const reportToken = signReportToken({ eventId, expiresAt: Date.now() + LINK_TTL_MS })
  return NextResponse.json({ ok: true, path: `/api/checkin-report/${reportToken}` })
}
