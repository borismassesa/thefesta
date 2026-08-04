import { createSupabaseServerClient } from '@/lib/supabase'
import { getEntrancePassData } from '@/lib/dashboard/queries'
import { generateEntryPassQrDataUrl } from '@/lib/checkin/qr'
import { renderTicketImage } from '@/lib/checkin/ticket-image'
import { resolveWalletPass } from '@/lib/checkin/wallet-tokens'

// Per-guest and capability-gated, so it must never sit in a shared cache.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * The guest's ticket PNG, addressed by their wallet management token.
 *
 * The same artwork as /entrance-pass/[token], reached through a capability
 * that cannot change an RSVP. The guest's RSVP token is looked up server-side
 * to reuse the existing ticket query and never leaves this process.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const supabase = createSupabaseServerClient()
  const resolved = await resolveWalletPass(token, supabase)

  // One response for every reason a pass cannot be drawn. An unknown token and
  // a revoked one must look identical, or the URL space becomes enumerable.
  if (resolved.state !== 'available') {
    return new Response('Not found', { status: 404, headers: { 'referrer-policy': 'no-referrer' } })
  }

  const { data: invitation } = await supabase
    .from('guest_invitations')
    .select('guest_contacts(public_token)')
    .eq('id', resolved.pass.invitationId)
    .maybeSingle<{ guest_contacts: { public_token: string } | null }>()

  const publicToken = invitation?.guest_contacts?.public_token
  if (!publicToken) return new Response('Not found', { status: 404 })

  const pass = await getEntrancePassData(publicToken, resolved.pass.eventId)
  if (!pass) return new Response('Not found', { status: 404 })

  try {
    const qrDataUrl = await generateEntryPassQrDataUrl(pass.guestContactId, pass.invitationId)
    // The admission behind this pass has been withdrawn. Same answer as every
    // other unavailable state on this route, so the surface stays uniform.
    if (!qrDataUrl) {
      return new Response('Not found', { status: 404, headers: { 'referrer-policy': 'no-referrer' } })
    }
    return await renderTicketImage(pass, qrDataUrl)
  } catch (err) {
    console.error('[wallet-pass] failed to render ticket', err)
    return new Response('Ticket temporarily unavailable', { status: 500 })
  }
}
