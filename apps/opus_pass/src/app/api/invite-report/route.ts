import { NextResponse, type NextRequest } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { InviteReportPdf } from '@/lib/invite-report-pdf'
import type { InviteReportData } from '@/lib/invite-report'
import { createSupabaseServerClient } from '@/lib/supabase'
import { clientIp, withinRateLimit, RATE_LIMITED_RESPONSE } from '@/lib/checkin/rate-limit'

export const runtime = 'nodejs'

// Same bounds as /api/checkin-report: generous for a very large wedding, but
// closed against an abusive or malformed body.
const MAX_BODY_BYTES = 500 * 1024
const MAX_ROWS = 5000

function isValidPayload(body: unknown): body is InviteReportData {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.eventName === 'string' &&
    typeof b.generatedAt === 'string' &&
    typeof b.invited === 'number' &&
    typeof b.delivered === 'number' &&
    typeof b.undelivered === 'number' &&
    typeof b.viewed === 'number' &&
    typeof b.responded === 'number' &&
    typeof b.creditsUsed === 'number' &&
    typeof b.creditsPurchased === 'number' &&
    Array.isArray(b.rows) &&
    b.rows.length <= MAX_ROWS
  )
}

export async function POST(req: NextRequest) {
  // Reads no DB, but it is unauthenticated and renders a PDF (CPU), so cap how
  // often one caller can trigger a render. Its own key, not the check-in
  // report's: pulling one report must never lock the couple out of the other.
  const supabase = createSupabaseServerClient()
  if (!(await withinRateLimit(supabase, `invite-report:${clientIp(req)}`, 20, 60))) {
    return NextResponse.json(RATE_LIMITED_RESPONSE, { status: 429 })
  }

  // Cap on the bytes actually received, not the client-supplied Content-Length,
  // which a non-browser caller can understate.
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
  if (!isValidPayload(body)) {
    return NextResponse.json({ error: 'Invalid invite report payload' }, { status: 400 })
  }

  try {
    const pdf = await renderToBuffer(
      createElement(InviteReportPdf, { data: body }) as ReactElement<DocumentProps>,
    )
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="OpusPass-Invite-Report.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[api/invite-report] PDF render failed', err)
    return NextResponse.json({ error: 'Could not generate the invite report' }, { status: 500 })
  }
}
