import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import {
  buildTicketElement,
  TICKET_HEIGHT,
  TICKET_WIDTH,
  type TicketInput,
} from '@/app/(site)/entrance-pass/[token]/ticket'

/**
 * Shared renderer for the entrance-pass ticket PNG.
 *
 * Two surfaces draw the same artwork: the original /entrance-pass/[token]
 * route (fetched by Meta at WhatsApp send time) and the guest's pass page at
 * /p/[token]/pass. Keeping one renderer means a change to the ticket cannot
 * land on one and miss the other.
 */

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

/**
 * Headers every ticket response must carry.
 *
 * The PNG contains the guest's scannable credential, so it must never reach a
 * shared cache. The URL that produced it is itself a capability, so it must
 * not travel in a Referer header either.
 */
export const TICKET_RESPONSE_HEADERS = {
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  // The page carrying this image is noindex, but the image URL can be reached
  // on its own (a pasted link, an intermediary that expands it) and a bare
  // Response inherits no page-level directive. A scannable ticket must never
  // end up in a search index.
  'x-robots-tag': 'noindex, nofollow, noimageindex',
} as const

/** Draw the ticket, or throw if an asset is missing. */
export async function renderTicketImage(
  pass: TicketInput['pass'],
  qrDataUrl: string,
  /** Printed under the QR. Optional so a caller that has not been updated
   *  still renders a valid ticket rather than failing. */
  passId?: string | null
): Promise<ImageResponse> {
  const [templateBuf, nameFontBuf, serifFontBuf, codeFontBuf] = await Promise.all([
    readPublicFile('entrance-pass', 'ticket-template.png'),
    readPublicFile('fonts', 'DancingScript-Regular.ttf'),
    readPublicFile('fonts', 'PlayfairDisplay-Bold.woff'),
    readPublicFile('fonts', 'Roboto-Bold.ttf'),
  ])

  return new ImageResponse(
    buildTicketElement({
      pass,
      templateDataUri: `data:image/png;base64,${templateBuf.toString('base64')}`,
      qrDataUrl,
      passId,
    }),
    {
      width: TICKET_WIDTH,
      height: TICKET_HEIGHT,
      fonts: [
        { name: 'Dancing Script', data: nameFontBuf, style: 'normal', weight: 400 },
        { name: 'Playfair Display', data: serifFontBuf, style: 'normal', weight: 700 },
        { name: 'Roboto', data: codeFontBuf, style: 'normal', weight: 700 },
      ],
      headers: TICKET_RESPONSE_HEADERS,
    }
  )
}
