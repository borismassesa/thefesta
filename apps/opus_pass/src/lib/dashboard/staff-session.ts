import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { STAFF_SESSION_COOKIE } from './staff-session-cookie'

/**
 * Staff dashboard sessions: an OpusFesta admin opening a couple's dashboard as
 * that couple, from Couple Accounts in the admin app.
 *
 * The verify half of apps/opus_admin/src/lib/couple-staff-session.ts —
 * duplicated on purpose, same as the check-in tokens in ../checkin/tokens.ts,
 * because there is no shared crypto package yet. COUPLE_STAFF_ACCESS_SECRET
 * must match across both apps.
 *
 * How it hangs together:
 *  - admin mints a 30-minute HMAC token and links the admin to
 *    /api/staff-access?token=…
 *  - that route verifies the token and stores it in an httpOnly cookie, so the
 *    token never sits in the address bar of the pages that follow.
 *  - getStaffSession() re-verifies the cookie on EVERY read. The cookie is the
 *    token itself, so a tampered or expired value simply stops resolving; there
 *    is no server-side session to invalidate and nothing to trust on its own.
 *  - loadDashboardUser() in ./auth.ts prefers a valid staff session over the
 *    Clerk session, which is the single place impersonation enters the app.
 *
 * Deliberately full access, not a read-only preview: staff build events and
 * guest lists for couples over the phone. Every issued session is written to
 * the admin audit log, and the dashboard renders a permanent banner naming the
 * staff member, so it is never mistaken for the couple's own session.
 */

export { STAFF_SESSION_COOKIE }

export interface StaffSession {
  /** public.users.id of the couple being acted for. */
  userId: string
  /** Staff member who opened it, for the banner. */
  adminEmail: string
  expiresAt: Date
}

function secret(): string | null {
  return process.env.COUPLE_STAFF_ACCESS_SECRET?.trim() || null
}

/** Verifies signature then expiry. Returns null for anything it cannot trust. */
export function verifyStaffToken(token: string): StaffSession | null {
  const key = secret()
  if (!key) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts

  const expected = createHmac('sha256', key).update(body).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      u?: unknown
      a?: unknown
      exp?: unknown
    }
    if (typeof parsed.u !== 'string' || !parsed.u) return null
    if (typeof parsed.exp !== 'number') return null
    if (parsed.exp * 1000 <= Date.now()) return null
    return {
      userId: parsed.u,
      adminEmail: typeof parsed.a === 'string' && parsed.a ? parsed.a : 'OpusFesta staff',
      expiresAt: new Date(parsed.exp * 1000),
    }
  } catch {
    return null
  }
}

/** The staff session for this request, or null. Safe to call anywhere on the
 *  server: it only ever reads a cookie it can verify. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value
  return token ? verifyStaffToken(token) : null
}

/** Seconds a verified token still has to run, floored at 0. Used as the
 *  cookie's max-age so the cookie can never outlive the token. */
export function remainingSeconds(session: StaffSession): number {
  return Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
}
