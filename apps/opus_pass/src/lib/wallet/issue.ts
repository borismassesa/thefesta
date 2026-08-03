import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import { ensureAdmissionCredential } from '@/lib/checkin/credentials'
import { partySizeLabel } from '@/app/entrance-pass/[token]/ticket'
import { resolveWalletPass } from '@/lib/checkin/wallet-tokens'
import { walletProvider } from './providers'
import type { WalletPassModel, WalletProviderId } from './types'

/**
 * Issue a wallet pass from a guest's own pass link.
 *
 * The order here is the whole security argument, so it is worth stating: the
 * wallet token is resolved first, the admission's eligibility is checked
 * second, the credential is resolved third, and only then does a provider see
 * anything. A provider adapter is never handed an invitation id it could look
 * things up with, only a finished model.
 */

export type IssueWalletPassOutcome =
  | { status: 'ok'; saveUrl: string }
  | { status: 'unavailable' }
  | { status: 'not_configured' }
  | { status: 'failed' }

export async function issueWalletPassForToken(
  token: unknown,
  provider: WalletProviderId
): Promise<IssueWalletPassOutcome> {
  const adapter = walletProvider(provider)
  if (!adapter.isConfigured()) return { status: 'not_configured' }

  const supabase = createSupabaseServerClient()
  const resolved = await resolveWalletPass(token, supabase)

  // Everything that is not a live, eligible pass collapses to one answer, for
  // the same reason the image route does: an unknown token and a revoked one
  // must be indistinguishable or the URL space becomes enumerable.
  if (resolved.state !== 'available') return { status: 'unavailable' }

  const pass = resolved.pass

  // The credential is the only thing that can open a door, so a withdrawn
  // admission must not produce a wallet pass either. ensureAdmissionCredential
  // refuses to mint after a revocation, which is what makes this safe.
  const credential = await ensureAdmissionCredential(pass.invitationId, 'wallet_pass', supabase)
  if (credential.status === 'revoked') return { status: 'unavailable' }
  if (credential.status !== 'ok') return { status: 'failed' }

  const model: WalletPassModel = {
    invitationId: pass.invitationId,
    eventId: pass.eventId,
    eventName: coupleLabel(pass.partner1Name, pass.partner2Name, pass.eventName),
    guestName: pass.guestName,
    venueName: pass.venueName,
    venueAddress: pass.city,
    startsAt: pass.startsAt,
    endsAt: pass.endsAt,
    ticketType: partySizeLabel(pass.entryAllowance),
    entryAllowance: pass.entryAllowance,
    credential: credential.credential.rawCredential,
  }

  const issued = await adapter.issue(model)

  // Bookkeeping is best-effort and deliberately after the fact: a guest who
  // has a working save link must not be denied it because a logging write
  // failed.
  const { error } = await supabase.rpc('record_wallet_pass', {
    p_guest_invitation_id: pass.invitationId,
    p_provider: provider,
    p_status: issued.ok ? 'issued' : 'failed',
    p_class_id: issued.ok ? issued.classId : null,
    p_object_id: issued.ok ? issued.objectId : null,
    p_error_code: issued.ok ? null : (issued.code ?? issued.reason),
  })
  if (error) console.error('[wallet] could not record pass issuance', { code: error.code })

  if (!issued.ok) {
    return issued.reason === 'not_configured' ? { status: 'not_configured' } : { status: 'failed' }
  }
  return { status: 'ok', saveUrl: issued.saveUrl }
}

/** The couple as printed on the ticket, falling back through what exists. */
function coupleLabel(
  partner1: string | null,
  partner2: string | null,
  eventName: string | null
): string {
  const names = [partner1, partner2].filter((n): n is string => Boolean(n && n.trim()))
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return names[0] || eventName || 'Celebration'
}
