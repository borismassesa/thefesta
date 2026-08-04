import { readFile } from 'node:fs/promises'
import path from 'node:path'
import QRCode from 'qrcode'
import { ImageResponse } from 'next/og'
import { getEntrancePassPreviewData } from '@/lib/dashboard/queries'
import { buildTicketElement, TICKET_HEIGHT, TICKET_WIDTH } from '../[token]/ticket'

// Owner-only, reflects whatever the couple last saved — never cached.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * The couple's own preview of this event's Entrance Pass Ticket, for the
 * send console's thumbnail. Same renderer and artwork as the real guest
 * ticket, but drawn from event details only: no guest, no party size, and
 * a decorative QR that carries no signed token (nothing here can admit
 * anyone). The guest-facing ticket lives at /entrance-pass/[token].
 */
export async function GET(req: Request) {
  const eventId = new URL(req.url).searchParams.get('event')
  if (!eventId) return new Response('Missing event', { status: 400 })

  const pass = await getEntrancePassPreviewData(eventId)
  if (!pass) return new Response('Not found', { status: 404 })

  let templateBuf: Buffer, nameFontBuf: Buffer, serifFontBuf: Buffer, qrDataUrl: string
  try {
    ;[templateBuf, nameFontBuf, serifFontBuf, qrDataUrl] = await Promise.all([
      readFile(path.join(process.cwd(), 'public', 'entrance-pass', 'ticket-template.png')),
      readFile(path.join(process.cwd(), 'public', 'fonts', 'DancingScript-Regular.ttf')),
      readFile(path.join(process.cwd(), 'public', 'fonts', 'PlayfairDisplay-Bold.woff')),
      QRCode.toDataURL('OPUSPASS-SAMPLE-TICKET', {
        margin: 1,
        width: 512,
        errorCorrectionLevel: 'M',
        color: { dark: '#4A2472', light: '#FFFFFF' },
      }),
    ])
  } catch (err) {
    console.error('[entrance-pass-preview] failed to load ticket assets', err)
    return new Response('Preview temporarily unavailable', { status: 500 })
  }

  return new ImageResponse(
    buildTicketElement({
      pass,
      templateDataUri: `data:image/png;base64,${templateBuf.toString('base64')}`,
      qrDataUrl,
      // A representative value, so the preview shows the Pass ID band the
      // real ticket now prints. Not a real identifier.
      passId: 'SAMPLE42',
    }),
    {
      width: TICKET_WIDTH,
      height: TICKET_HEIGHT,
      fonts: [
        { name: 'Dancing Script', data: nameFontBuf, style: 'normal', weight: 400 },
        { name: 'Playfair Display', data: serifFontBuf, style: 'normal', weight: 700 },
      ],
      headers: { 'cache-control': 'private, no-store' },
    },
  )
}
