import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { getEntrancePassData } from '@/lib/dashboard/queries'
import { generateEntryPassQrDataUrl } from '@/lib/checkin/qr'
import { buildTicketElement, TICKET_HEIGHT, TICKET_WIDTH } from './ticket'

// Fetched live by Meta at WhatsApp send time (same mechanism as the invite
// card header) and opened directly by guests — never cached per-guest data
// behind a shared CDN key.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Static assets never change at runtime — memoize the read (module-scoped,
// lives for the container's lifetime) instead of re-reading disk and
// re-encoding base64 on every single guest/Meta request.
const fileCache = new Map<string, Promise<Buffer>>()
function readPublicFile(...segments: string[]): Promise<Buffer> {
  const key = segments.join('/')
  let cached = fileCache.get(key)
  if (!cached) {
    // Never cache a rejection — a transient read failure shouldn't poison
    // every subsequent request for the rest of the container's lifetime.
    cached = readFile(path.join(process.cwd(), 'public', ...segments)).catch((err) => {
      fileCache.delete(key)
      throw err
    })
    fileCache.set(key, cached)
  }
  return cached
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const eventId = new URL(req.url).searchParams.get('event')
  if (!eventId) return new Response('Missing event', { status: 400 })

  const pass = await getEntrancePassData(token, eventId)
  if (!pass) return new Response('Not found', { status: 404 })

  let templateBuf: Buffer, nameFontBuf: Buffer, serifFontBuf: Buffer, qrDataUrl: string | null
  try {
    ;[templateBuf, nameFontBuf, serifFontBuf, qrDataUrl] = await Promise.all([
      readPublicFile('entrance-pass', 'ticket-template.png'),
      readPublicFile('fonts', 'DancingScript-Regular.ttf'),
      readPublicFile('fonts', 'PlayfairDisplay-Bold.woff'),
      generateEntryPassQrDataUrl(pass.guestContactId, pass.invitationId),
    ])
  } catch (err) {
    console.error('[entrance-pass] failed to load ticket assets', err)
    return new Response('Ticket temporarily unavailable', { status: 500 })
  }

  // Withdrawn. Drawing anything here would put a working pass back in the
  // guest's hands, so the ticket simply stops existing.
  if (!qrDataUrl) return new Response('Not found', { status: 404 })

  return new ImageResponse(
    buildTicketElement({
      pass,
      templateDataUri: `data:image/png;base64,${templateBuf.toString('base64')}`,
      qrDataUrl,
    }),
    {
      width: TICKET_WIDTH,
      height: TICKET_HEIGHT,
      fonts: [
        { name: 'Dancing Script', data: nameFontBuf, style: 'normal', weight: 400 },
        { name: 'Playfair Display', data: serifFontBuf, style: 'normal', weight: 700 },
      ],
      headers: {
        // The PNG contains the guest's scannable credential, so it must never
        // reach a shared cache where another guest could be served it.
        'cache-control': 'private, no-store',
        // The ticket URL carries the guest's own capability token. Without
        // this, opening it from anywhere that renders HTML would leak that
        // token to whatever the page links to next.
        'referrer-policy': 'no-referrer',
      },
    },
  )
}
