import 'server-only'
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  type CredentialKeyring,
  decryptCredential,
  encryptCredential,
  hashCredential,
  loadCredentialKeyring,
} from './credential-core'

/**
 * The guest's pass-management capability: the token behind /p/<token>.
 *
 * Deliberately NOT the RSVP token and NOT the admission credential. It shows a
 * pass and, from PR 4, hands it to a wallet. It cannot change an RSVP, read a
 * guest's contact details, or admit anybody.
 */

/**
 * Namespaced so it can never be mistaken for an admission credential. The
 * scanner's parser rejects every colon-bearing value that is not a valid OP1,
 * so presenting one of these at a door fails as malformed rather than being
 * filed as a legacy scan.
 */
export const WALLET_TOKEN_PREFIX = 'WMT1'

const TOKEN_BYTES = 32

/** Same shape rules as an admission credential, different namespace. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,88}$/

let cachedKeyring: CredentialKeyring | null = null
function keyring(): CredentialKeyring {
  if (!cachedKeyring) cachedKeyring = loadCredentialKeyring()
  return cachedKeyring
}

export function walletTokensConfigured(): boolean {
  try {
    keyring()
    return true
  } catch {
    return false
  }
}

function generateRawWalletToken(): string {
  return `${WALLET_TOKEN_PREFIX}:${randomBytes(TOKEN_BYTES).toString('base64url')}`
}

/**
 * Accept only exactly what we mint. Same strictness as the admission parser:
 * no trimming, no case folding, nothing repaired into validity.
 */
export function isWalletTokenShape(input: unknown): input is string {
  if (typeof input !== 'string') return false
  if (!input.startsWith(`${WALLET_TOKEN_PREFIX}:`)) return false
  return TOKEN_PATTERN.test(input.slice(WALLET_TOKEN_PREFIX.length + 1))
}

export interface WalletManagementToken {
  tokenId: string
  rawToken: string
  created: boolean
}

/**
 * The invitation's live pass link, minting one if it has none.
 *
 * Re-sending must reproduce the SAME URL. A link already delivered to a
 * WhatsApp thread cannot be recalled, so minting a fresh one on every send
 * would leave the guest holding a message whose link had silently stopped
 * working. That is why the raw token is recoverable at all.
 */
export async function ensureWalletManagementToken(
  invitationId: string,
  source: string,
  client?: SupabaseClient
): Promise<WalletManagementToken | null> {
  const supabase = client ?? createSupabaseServerClient()
  const ring = keyring()

  const candidate = generateRawWalletToken()
  const encrypted = encryptCredential(candidate, ring)

  const { data, error } = await supabase.rpc('ensure_wallet_management_token', {
    p_guest_invitation_id: invitationId,
    p_token_hash_hex: hashCredential(candidate),
    p_token_ciphertext_hex: encrypted.ciphertextHex,
    p_key_version: encrypted.keyVersion,
    p_source: source,
  })

  if (error) {
    console.error('[wallet-token] ensure failed', { invitationId, code: error.code })
    return null
  }

  const row = (data as EnsureWalletTokenRow[] | null)?.[0]
  if (!row || row.result === 'not_found' || !row.token_id) return null

  if (row.created) return { tokenId: row.token_id, rawToken: candidate, created: true }

  try {
    const rawToken = decryptCredential(row.token_ciphertext_hex, row.encryption_key_version, ring)
    return { tokenId: row.token_id, rawToken, created: false }
  } catch {
    console.error('[wallet-token] stored token could not be decrypted', {
      invitationId,
      keyVersion: row.encryption_key_version,
    })
    return null
  }
}

/** Invalidate an invitation's pass link. Returns how many were revoked. */
export async function revokeWalletManagementTokens(
  invitationId: string,
  reason: string,
  client?: SupabaseClient
): Promise<number> {
  const supabase = client ?? createSupabaseServerClient()
  const { data, error } = await supabase.rpc('revoke_wallet_management_token', {
    p_guest_invitation_id: invitationId,
    p_reason: reason,
  })
  if (error) {
    console.error('[wallet-token] revoke failed', { invitationId, code: error.code })
    return 0
  }
  return typeof data === 'number' ? data : 0
}

/**
 * What the pass surface is allowed to know.
 *
 * Nothing here identifies the guest beyond the name already printed on their
 * ticket. No phone, no email, no RSVP token, no admission credential.
 */
export interface WalletPassView {
  tokenStatus: 'active' | 'revoked' | 'expired'
  invitationId: string
  eventId: string
  guestName: string
  rsvpStatus: string
  entryAllowance: number
  checkedInCount: number
  eventName: string | null
  eventType: string | null
  partner1Name: string | null
  partner2Name: string | null
  ticketLanguage: string | null
  venueName: string | null
  city: string | null
  startsAt: string | null
  endsAt: string | null
}

/** The four states the landing page renders. */
export type WalletPassState =
  | { state: 'available'; pass: WalletPassView }
  | { state: 'not_yet_eligible'; pass: WalletPassView }
  | { state: 'revoked'; pass: WalletPassView | null }
  | { state: 'event_over'; pass: WalletPassView }
  | { state: 'unknown' }

/**
 * Resolve a scanned-in URL token to what may be shown.
 *
 * `unknown` deliberately covers both "never issued" and "wrong shape": the
 * page must not distinguish them, or the URL space becomes enumerable.
 */
export async function resolveWalletPass(
  token: unknown,
  client?: SupabaseClient,
  now: Date = new Date()
): Promise<WalletPassState> {
  if (!isWalletTokenShape(token)) return { state: 'unknown' }

  const supabase = client ?? createSupabaseServerClient()
  const { data, error } = await supabase.rpc('resolve_wallet_management_token', {
    p_token_hash_hex: hashCredential(token),
  })

  if (error) {
    console.error('[wallet-token] resolve failed', { code: error.code })
    return { state: 'unknown' }
  }

  const row = (data as ResolveWalletTokenRow[] | null)?.[0]
  if (!row) return { state: 'unknown' }

  const pass: WalletPassView = {
    tokenStatus: row.token_status as WalletPassView['tokenStatus'],
    invitationId: row.guest_invitation_id,
    eventId: row.event_id,
    guestName: row.guest_name,
    rsvpStatus: row.rsvp_status,
    entryAllowance: row.entry_allowance,
    checkedInCount: row.checked_in_count,
    eventName: row.event_name,
    eventType: row.event_type,
    partner1Name: row.partner1_name,
    partner2Name: row.partner2_name,
    ticketLanguage: row.ticket_language,
    venueName: row.venue_name,
    city: row.city,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }

  // A revoked or expired link stops working even for a guest who is still
  // perfectly entitled to attend: revocation is how a forwarded link is shut
  // off, so it has to outrank eligibility.
  if (row.token_status !== 'active') return { state: 'revoked', pass }

  // The RSVP is the eligibility gate for a WALLET pass, and it is deliberately
  // stricter than the door, which now admits any invited guest. A wallet pass
  // is a credential a guest saves to their phone and keeps; the web pass is
  // what an unreplied guest is handed, and that one the door accepts. Google
  // Wallet is paused behind its own flag, so nothing reaches a guest from here
  // today — revisit this gate before it is switched back on.
  if (row.rsvp_status !== 'attending') return { state: 'not_yet_eligible', pass }

  const reference = row.ends_at
    ? Date.parse(row.ends_at)
    : row.starts_at
      ? Date.parse(row.starts_at) + 24 * 3600_000
      : NaN
  if (Number.isFinite(reference) && now.getTime() > reference) {
    return { state: 'event_over', pass }
  }

  return { state: 'available', pass }
}

interface EnsureWalletTokenRow {
  result: 'issued' | 'existing' | 'not_found'
  token_id: string | null
  token_ciphertext_hex: string
  encryption_key_version: number
  created: boolean
}

interface ResolveWalletTokenRow {
  token_id: string
  token_status: string
  guest_invitation_id: string
  event_id: string
  guest_name: string
  rsvp_status: string
  entry_allowance: number
  checked_in_count: number
  event_name: string | null
  event_type: string | null
  partner1_name: string | null
  partner2_name: string | null
  ticket_language: string | null
  venue_name: string | null
  city: string | null
  starts_at: string | null
  ends_at: string | null
}
