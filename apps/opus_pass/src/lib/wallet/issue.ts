import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import { ensureAdmissionCredential } from '@/lib/checkin/credentials'
import { resolveWalletPass } from '@/lib/checkin/wallet-tokens'
import { walletProvider } from './providers'
import type { WalletPassModel, WalletProviderId } from './types'
import { DOUBLE_TICKET_PARTY, SINGLE_TICKET_PARTY, WAKWE_TICKET_PARTY } from '@/lib/dashboard/types'

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
  if (resolved.state !== 'available') {
    // Logged because the question "how many guests failed to save a pass
    // tonight, and why" is otherwise unanswerable: everything below this line
    // records to wallet_passes, and everything above it used to record
    // nothing at all.
    console.warn('[wallet] pass not issuable', { provider, state: resolved.state })
    return { status: 'unavailable' }
  }

  const pass = resolved.pass

  // The credential is the only thing that can open a door, so a withdrawn
  // admission must not produce a wallet pass either. ensureAdmissionCredential
  // refuses to mint after a revocation, which is what makes this safe.
  const credential = await ensureAdmissionCredential(pass.invitationId, 'wallet_pass', supabase)
  if (credential.status === 'revoked') {
    console.warn('[wallet] admission withdrawn, refusing to issue', {
      provider,
      invitationId: pass.invitationId,
    })
    return { status: 'unavailable' }
  }
  if (credential.status !== 'ok') {
    console.error('[wallet] could not resolve an admission credential', {
      provider,
      invitationId: pass.invitationId,
    })
    return { status: 'failed' }
  }

  // Read straight from the invitation rather than widening
  // resolve_wallet_management_token's result shape. That RPC is a database
  // function shared by several callers; this is one column on a row we already
  // have the id for, and a failure here must not deny a guest a working pass —
  // the alternateText simply falls back to the ticket type.
  const { data: passIdRow } = await supabase
    .from('guest_invitations')
    .select('pass_id')
    .eq('id', pass.invitationId)
    .maybeSingle<{ pass_id: string | null }>()

  const model: WalletPassModel = {
    invitationId: pass.invitationId,
    passId: passIdRow?.pass_id ?? null,
    eventId: pass.eventId,
    eventName: coupleLabel(pass.partner1Name, pass.partner2Name, pass.eventName),
    guestName: pass.guestName,
    venueName: pass.venueName,
    venueAddress: pass.city,
    startsAt: pass.startsAt,
    endsAt: pass.endsAt,
    ticketType: admissionLabel(pass.entryAllowance),
    entryAllowance: pass.entryAllowance,
    credential: credential.credential.rawCredential,
    credentialId: credential.credential.credentialId,
  }

  const issued = await adapter.issue(model)

  // Bookkeeping is best-effort and deliberately after the fact: a guest who
  // has a working save link must not be denied it because a logging write
  // failed.
  const { data, error } = await supabase.rpc('record_wallet_pass', {
    p_guest_invitation_id: pass.invitationId,
    p_provider: provider,
    p_status: issued.ok ? 'issued' : 'failed',
    p_class_id: issued.ok ? issued.classId : null,
    p_object_id: issued.ok ? issued.objectId : null,
    p_error_code: issued.ok ? null : (issued.code ?? issued.reason),
  })

  // The RPC reports a missing invitation as a RESULT, not an error, so
  // checking `error` alone would let a silent non-write look like a success.
  // Every field needed to correlate this back to a guest goes in the line.
  const recorded = (data as { result?: string }[] | null)?.[0]?.result
  if (error || recorded !== 'recorded') {
    console.error('[wallet] pass issuance was not recorded', {
      provider,
      invitationId: pass.invitationId,
      issued: issued.ok,
      result: recorded ?? 'none',
      code: error?.code,
    })
  }

  if (!issued.ok) {
    return issued.reason === 'not_configured' ? { status: 'not_configured' } : { status: 'failed' }
  }
  return { status: 'ok', saveUrl: issued.saveUrl }
}

/**
 * What the pass calls this admission.
 *
 * Deliberately NOT the ticket artwork's partySizeLabel, which is a two-word
 * pill vocabulary where "anything above one is a Double". That is a fine
 * choice on a printed ticket and a bad one here: this string is also the
 * readable text under the barcode, so a party of four reading "DOUBLE" tells a
 * door steward the wrong number.
 */
function admissionLabel(entryAllowance: number): string {
  if (entryAllowance <= SINGLE_TICKET_PARTY) return 'Single'
  if (entryAllowance === DOUBLE_TICKET_PARTY) return 'Double'
  // Wakwe is ten on one code, so the word alone would leave a steward
  // counting; the pass says both.
  if (entryAllowance === WAKWE_TICKET_PARTY) return `Wakwe (admits ${entryAllowance})`
  return `Admits ${entryAllowance}`
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
