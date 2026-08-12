import { getEntrancePassData } from '@/lib/dashboard/queries'
import { generateEntryPassQrDataUrl } from '@/lib/checkin/qr'
import { renderTicketImage } from '@/lib/checkin/ticket-image'

// Fetched live by Meta at WhatsApp send time (same mechanism as the invite
// card header) and opened directly by guests — never cached per-guest data
// behind a shared CDN key.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const eventId = new URL(req.url).searchParams.get('event')
  if (!eventId) return new Response('Missing event', { status: 400 })

  const pass = await getEntrancePassData(token, eventId)
  if (!pass) return new Response('Not found', { status: 404 })

  try {
    const qrDataUrl = await generateEntryPassQrDataUrl(pass.guestContactId, pass.invitationId)
    // Withdrawn. Drawing anything here would put a working pass back in the
    // guest's hands, so the ticket simply stops existing.
    if (!qrDataUrl) return new Response('Not found', { status: 404 })
    return await renderTicketImage(pass, qrDataUrl, pass.passId)
  } catch (err) {
    console.error('[entrance-pass] failed to render ticket', err)
    return new Response('Ticket temporarily unavailable', { status: 500 })
  }
}
