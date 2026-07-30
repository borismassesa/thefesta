import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'

/**
 * Signs the short-lived token that lets a staff member open a couple's real
 * OpusPass dashboard as that couple.
 *
 * DUPLICATED, deliberately, in apps/opus_pass/src/lib/dashboard/staff-session.ts
 * (verify side) — the same arrangement as the check-in tokens in
 * ./checkin-tokens.ts, since there is no shared crypto package yet.
 * COUPLE_STAFF_ACCESS_SECRET must match across opus_admin and opus_pass or the
 * token minted here will not verify there.
 *
 * The token is the whole authority, so it is kept deliberately weak in scope:
 *  - 30-minute expiry, so a leaked link dies quickly.
 *  - a random nonce, so two sessions for the same couple never share a value
 *    (this is what makes the cookie distinguishable in logs).
 *  - the acting admin's email is inside the signed payload, so opus_pass can
 *    show whose session it is without trusting a query string.
 */

const TTL_SECONDS = 30 * 60

export interface CoupleStaffTokenPayload {
  /** public.users.id of the couple whose dashboard is being opened. */
  u: string
  /** Acting staff member's email — displayed in the dashboard banner. */
  a: string
  /** Expiry, epoch seconds. */
  exp: number
  /** Random nonce. */
  n: string
}

function secret(): string | null {
  return process.env.COUPLE_STAFF_ACCESS_SECRET?.trim() || null
}

export function hasCoupleStaffAccessSecret(): boolean {
  return secret() !== null
}

/** Returns null when COUPLE_STAFF_ACCESS_SECRET is not configured — the caller
 *  turns that into a readable "not available on this environment" message
 *  rather than a crash. */
export function signCoupleStaffToken(input: { userId: string; adminEmail: string }): string | null {
  const key = secret()
  if (!key) return null

  const payload: CoupleStaffTokenPayload = {
    u: input.userId,
    a: input.adminEmail,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    n: randomBytes(8).toString('hex'),
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', key).update(body).digest('base64url')
  return `${body}.${sig}`
}

export const COUPLE_STAFF_TOKEN_TTL_MINUTES = TTL_SECONDS / 60
