import { parseAdmissionCredential } from '@/lib/checkin/credential-core'

/**
 * The boundary between OpusPass and the wallet providers.
 *
 * Apple and Google own presentation and storage. OpusPass owns identity,
 * validity, entry allowance and redemption. Nothing below this interface may
 * decide whether a guest gets in; a provider adapter only turns an admission
 * that already exists into something a phone can hold.
 *
 * Kept free of `server-only` and of any database import so the pass model and
 * its invariants can be unit tested without a network or a cluster.
 */

export type WalletProviderId = 'google' | 'apple'

/**
 * Everything a provider is allowed to know about an admission.
 *
 * Deliberately a flat, already-resolved value rather than an invitation id:
 * an adapter cannot go looking for a phone number or an RSVP token, because
 * it is never handed anything it could look them up with.
 */
export interface WalletPassModel {
  /** Stable per-admission identifier, used to derive the provider object id. */
  invitationId: string
  /** Stable per-event identifier, used to derive the provider class id. */
  eventId: string

  /** The couple, as printed on the ticket ("Samwel & Julieth"). */
  eventName: string
  /** Guest name as it appears on the host's list. */
  guestName: string

  venueName: string | null
  venueAddress: string | null
  /** RFC3339. Null when the host has not announced a date yet. */
  startsAt: string | null
  endsAt: string | null

  /** Single, Double, Family... shown as the admission type. */
  ticketType: string
  /** How many this pass admits in total. */
  entryAllowance: number

  /**
   * The OP1 admission credential. This is the ONLY thing that can open a door,
   * and it is opaque: the provider stores and displays it without being able
   * to interpret it.
   */
  credential: string
  /**
   * Identifies WHICH credential the pass was built from.
   *
   * Part of the provider object id, so a rotated credential produces a new
   * object. Without it the object id is derived from the invitation alone,
   * which is permanent, and a saved pass would keep presenting the superseded
   * credential forever — failing at the door with no way to repair it.
   */
  credentialId: string
}

export type WalletIssueResult =
  | { ok: true; saveUrl: string; classId: string; objectId: string }
  | { ok: false; reason: 'not_configured' | 'invalid_model' | 'provider_error'; code?: string }

export interface WalletProvider {
  readonly id: WalletProviderId
  /** False when the deployment has no credentials for this provider. */
  isConfigured(): boolean
  /** Turn an admission into something the guest's phone can save. */
  issue(model: WalletPassModel): Promise<WalletIssueResult>
}

/**
 * Reject a model that would produce a misleading pass.
 *
 * A pass with no credential is worse than no pass: it looks valid in a wallet
 * and fails at the door, in front of a queue. So the credential is checked
 * with the DOOR's own parser rather than a prefix test — otherwise 'OP1:' and
 * 'OP1:short' both pass here and are refused as malformed at the gate, which
 * is precisely the failure this function exists to prevent.
 */
export function validatePassModel(model: WalletPassModel): string | null {
  if (!model.invitationId || !model.eventId) return 'missing identifiers'
  if (!model.credentialId) return 'missing identifiers'
  if (parseAdmissionCredential(model.credential)?.kind !== 'opaque_v1') {
    return 'credential is not a valid OP1 admission credential'
  }
  if (!model.eventName.trim()) return 'missing event name'
  if (!model.guestName.trim()) return 'missing guest name'
  if (!Number.isInteger(model.entryAllowance) || model.entryAllowance < 1) {
    return 'entry allowance must be a positive integer'
  }
  return null
}
