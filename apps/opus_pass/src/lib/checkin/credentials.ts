import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  type CredentialIssuanceSource,
  type CredentialKeyring,
  credentialFingerprint,
  decryptCredential,
  encryptCredential,
  generateRawCredential,
  hashCredential,
  loadCredentialKeyring,
  parseAdmissionCredential,
} from './credential-core'
import { verifyEntryPassToken } from './tokens'

/**
 * Issuance and verification of opaque admission credentials.
 *
 * The raw credential exists in exactly three places: this module's locals, the
 * QR drawn onto a ticket, and the guest's phone. It is never logged, never
 * returned to a scanner, and never stored in a readable column.
 */

let cachedKeyring: CredentialKeyring | null = null

/** Parsed once per container; the keys never change within a deployment. */
function keyring(): CredentialKeyring {
  if (!cachedKeyring) cachedKeyring = loadCredentialKeyring()
  return cachedKeyring
}

/** Whether opaque credentials can be issued at all in this environment. */
export function credentialIssuanceConfigured(): boolean {
  try {
    keyring()
    return true
  } catch {
    return false
  }
}

export interface EnsureAdmissionCredentialResult {
  credentialId: string
  rawCredential: string
  created: boolean
}

/**
 * `revoked` is deliberately NOT merged into `null`. A caller that cannot tell
 * a withdrawn pass from a transient failure will fall back to drawing
 * something, and for the ticket renderer that fallback is a legacy token —
 * which would bring the revoked pass straight back.
 */
export type EnsureAdmissionCredentialOutcome =
  | { status: 'ok'; credential: EnsureAdmissionCredentialResult }
  | { status: 'revoked' }
  | { status: 'failed' }

/**
 * The invitation's active credential, minting one if it has none.
 *
 * A candidate is generated up front because the raw value cannot be recovered
 * from the hash, and the RPC has to be able to store it in the same locked
 * section that decides whether a new one is needed. When an active credential
 * already exists the candidate is simply dropped and the stored ciphertext
 * comes back for decryption, so re-rendering a ticket never invalidates the
 * copy already in a guest's WhatsApp thread.
 */
export async function ensureAdmissionCredential(
  invitationId: string,
  source: CredentialIssuanceSource,
  client?: SupabaseClient
): Promise<EnsureAdmissionCredentialOutcome> {
  const supabase = client ?? createSupabaseServerClient()
  const ring = keyring()

  const candidate = generateRawCredential()
  const encrypted = encryptCredential(candidate, ring)

  const { data, error } = await supabase.rpc('ensure_admission_credential', {
    p_guest_invitation_id: invitationId,
    p_token_hash_hex: hashCredential(candidate),
    p_token_ciphertext_hex: encrypted.ciphertextHex,
    p_key_version: encrypted.keyVersion,
    p_source: source,
  })

  if (error) {
    // Never interpolate the error: a provider payload can echo the parameters
    // it was called with, and those include the ciphertext.
    console.error('[credentials] ensure failed', { invitationId, code: error.code })
    return { status: 'failed' }
  }

  const row = (data as EnsureCredentialRow[] | null)?.[0]
  if (row?.result === 'revoked') return { status: 'revoked' }
  if (!row || row.result === 'not_found' || !row.credential_id) return { status: 'failed' }

  if (row.created) {
    return {
      status: 'ok',
      credential: { credentialId: row.credential_id, rawCredential: candidate, created: true },
    }
  }

  try {
    const rawCredential = decryptCredential(
      row.token_ciphertext_hex,
      row.encryption_key_version,
      ring
    )
    return {
      status: 'ok',
      credential: { credentialId: row.credential_id, rawCredential, created: false },
    }
  } catch {
    // A credential we cannot read is a credential we cannot reprint. Rotating
    // is the only way back to a working ticket, and it is safe: the unreadable
    // one is stood down in the same transaction.
    console.error('[credentials] stored credential could not be decrypted, rotating', {
      invitationId,
      keyVersion: row.encryption_key_version,
    })
    const rotated = await rotateAdmissionCredential(
      invitationId,
      'Stored credential could not be decrypted with any configured key',
      'rotation',
      supabase
    )
    return rotated ? { status: 'ok', credential: rotated } : { status: 'failed' }
  }
}

/** Stand down an invitation's credential and issue a replacement atomically. */
export async function rotateAdmissionCredential(
  invitationId: string,
  reason: string,
  source: CredentialIssuanceSource = 'rotation',
  client?: SupabaseClient,
  actor?: string
): Promise<EnsureAdmissionCredentialResult | null> {
  const supabase = client ?? createSupabaseServerClient()
  const ring = keyring()

  const candidate = generateRawCredential()
  const encrypted = encryptCredential(candidate, ring)

  const { data, error } = await supabase.rpc('rotate_admission_credential', {
    p_guest_invitation_id: invitationId,
    p_token_hash_hex: hashCredential(candidate),
    p_token_ciphertext_hex: encrypted.ciphertextHex,
    p_key_version: encrypted.keyVersion,
    p_reason: reason,
    p_source: source,
    p_actor: actor ?? null,
  })

  if (error) {
    console.error('[credentials] rotate failed', { invitationId, code: error.code })
    return null
  }

  const row = (data as RotateCredentialRow[] | null)?.[0]
  if (!row || row.result !== 'rotated' || !row.credential_id) return null

  return { credentialId: row.credential_id, rawCredential: candidate, created: true }
}

/** Revoke a specific credential. The guest has no working pass afterwards. */
export async function revokeAdmissionCredential(
  credentialId: string,
  reason: string,
  client?: SupabaseClient,
  actor?: string
): Promise<boolean> {
  const supabase = client ?? createSupabaseServerClient()
  const { data, error } = await supabase.rpc('revoke_admission_credential', {
    p_credential_id: credentialId,
    p_reason: reason,
    p_actor: actor ?? null,
  })
  if (error) {
    console.error('[credentials] revoke failed', { credentialId, code: error.code })
    return false
  }
  return (data as RevokeCredentialRow[] | null)?.[0]?.result === 'revoked'
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

export type CredentialVerificationFailure =
  | 'malformed'
  | 'unknown'
  | 'revoked'
  | 'expired'
  | 'superseded'
  | 'legacy_not_allowed'
  | 'invitation_mismatch'
  /** The store could not be reached. NOT the same as "never issued": a door
   *  must retry, not refuse a legitimate guest during an outage. */
  | 'unavailable'

export type AdmissionCredentialVerification =
  | {
      valid: true
      format: 'opaque_v1'
      credentialId: string
      invitationId: string
      status: 'active'
      fingerprint: string
    }
  | {
      valid: true
      format: 'legacy_hmac'
      invitationId: string
      guestContactId: string
      fingerprint: string
    }
  | {
      valid: false
      format: 'opaque_v1' | 'legacy_hmac' | 'unparseable'
      reason: CredentialVerificationFailure
      fingerprint: string | null
      /** Present when the credential resolved but failed a later check. */
      invitationId?: string
      credentialId?: string
      statusAtScan?: string
    }

/**
 * Verify a scanned string against the credential store.
 *
 * Returns the precise internal reason, which callers MUST NOT hand to the
 * door verbatim: telling an unauthenticated scanner apart "revoked" from
 * "never existed" turns the endpoint into a credential-enumeration oracle.
 * The audit record keeps the distinction; the public response collapses it.
 *
 * Event binding is deliberately NOT done here. Resolution yields an
 * invitation; the caller binds that to the event it already authorised the
 * scanner for.
 */
export async function verifyAdmissionCredential(
  scanned: string,
  /**
   * Whether the compatibility window is still open. Evaluated for the event
   * the SCANNER was authorised for, never for an event reached through the
   * credential, so a stale ticket cannot pick a more permissive window by
   * pointing somewhere else.
   */
  options: { legacyAllowed: () => boolean | Promise<boolean> },
  client?: SupabaseClient
): Promise<AdmissionCredentialVerification> {
  const parsed = parseAdmissionCredential(scanned)
  if (!parsed) {
    return { valid: false, format: 'unparseable', reason: 'malformed', fingerprint: null }
  }

  const fingerprint = credentialFingerprint(parsed.raw)

  if (parsed.kind === 'legacy_hmac') {
    // Anything that is not a well-formed OP1 reaches here, so a stray QR (a
    // supermarket barcode, another app's token) hits this line. Once
    // CHECKIN_TOKEN_SECRET is retired the verifier throws on a missing secret,
    // and an uncaught throw would turn the first stray scan of the night into
    // a 500 instead of "not a valid entry pass".
    let payload: ReturnType<typeof verifyEntryPassToken> = null
    try {
      payload = verifyEntryPassToken(parsed.raw)
    } catch {
      return { valid: false, format: 'legacy_hmac', reason: 'legacy_not_allowed', fingerprint }
    }
    if (!payload) {
      return { valid: false, format: 'legacy_hmac', reason: 'malformed', fingerprint }
    }
    if (!(await options.legacyAllowed())) {
      return {
        valid: false,
        format: 'legacy_hmac',
        reason: 'legacy_not_allowed',
        fingerprint,
        invitationId: payload.invitationId,
      }
    }
    return {
      valid: true,
      format: 'legacy_hmac',
      invitationId: payload.invitationId,
      guestContactId: payload.guestContactId,
      fingerprint,
    }
  }

  const supabase = client ?? createSupabaseServerClient()
  const { data, error } = await supabase.rpc('resolve_admission_credential', {
    p_token_hash_hex: hashCredential(parsed.raw),
  })

  if (error) {
    // Deliberately NOT 'unknown'. Collapsing an outage into "never issued"
    // would tell every arriving guest their ticket is fake for as long as the
    // database is unwell. The two are only indistinguishable when the store is
    // healthy, which is when the enumeration property actually matters.
    console.error('[credentials] resolve failed', { code: error.code })
    return { valid: false, format: 'opaque_v1', reason: 'unavailable', fingerprint }
  }

  const row = (data as ResolveCredentialRow[] | null)?.[0]
  if (!row) {
    return { valid: false, format: 'opaque_v1', reason: 'unknown', fingerprint }
  }

  if (row.status !== 'active') {
    const reason: CredentialVerificationFailure =
      row.status === 'revoked' ? 'revoked' : row.status === 'superseded' ? 'superseded' : 'expired'
    return {
      valid: false,
      format: 'opaque_v1',
      reason,
      fingerprint,
      invitationId: row.guest_invitation_id,
      credentialId: row.credential_id,
      statusAtScan: row.status,
    }
  }

  return {
    valid: true,
    format: 'opaque_v1',
    credentialId: row.credential_id,
    invitationId: row.guest_invitation_id,
    status: 'active',
    fingerprint,
  }
}

export interface RecordVerificationInput {
  eventId: string
  verification: AdmissionCredentialVerification
  /** What the route concluded, which may differ from the verification reason
   *  (an otherwise valid credential bound to the wrong event, say). */
  verificationResult: string
  scannerAccessTokenId?: string | null
  requestId?: string | null
}

/**
 * Record a verification attempt, including the ones that resolved nothing.
 *
 * Separate from the admission ledger because a failure often has no invitation
 * to attach to, and because this is the table that says when the legacy branch
 * has stopped being used.
 */
export async function recordCredentialVerification(
  input: RecordVerificationInput,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? createSupabaseServerClient()
  const v = input.verification

  const { error } = await supabase.from('admission_credential_verifications').insert({
    event_id: input.eventId,
    credential_id: v.valid && v.format === 'opaque_v1' ? v.credentialId : (!v.valid && v.credentialId) || null,
    guest_invitation_id: v.valid ? v.invitationId : (!v.valid && v.invitationId) || null,
    credential_format: v.format,
    credential_status_at_scan: v.valid ? 'active' : (!v.valid && v.statusAtScan) || null,
    verification_result: input.verificationResult,
    token_fingerprint: v.fingerprint,
    scanner_access_token_id: input.scannerAccessTokenId ?? null,
    request_id: input.requestId ?? null,
  })

  // Audit must never take the door down. A scan that admitted a guest is not
  // undone because its log line failed to land.
  if (error) console.error('[credentials] verification audit failed', { code: error.code })
}

/* -------------------------------------------------------------------------- */
/* RPC row shapes                                                             */
/* -------------------------------------------------------------------------- */

interface EnsureCredentialRow {
  result: 'issued' | 'existing' | 'not_found' | 'revoked'
  credential_id: string | null
  token_ciphertext_hex: string
  encryption_key_version: number
  created: boolean
}

interface RotateCredentialRow {
  result: 'rotated' | 'not_found'
  credential_id: string | null
  superseded_credential_id: string | null
}

interface RevokeCredentialRow {
  result: 'revoked' | 'not_active'
  credential_id: string
}

interface ResolveCredentialRow {
  credential_id: string
  guest_invitation_id: string
  event_id: string
  status: string
  rsvp_status: string
}
