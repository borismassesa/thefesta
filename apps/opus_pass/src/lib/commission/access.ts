import 'server-only'
import { getDashboardUser } from '@/lib/dashboard/auth'
import { verifyClaimToken } from './claim-tokens'
import { getOrderById, getOrderByNo, type CardOrderRow } from './orders'

/**
 * "Token or Clerk" — the access rule for every customer-facing commission
 * route (OP-CCS-TDD-001 §8).
 *
 * An order can be read and its brief completed by:
 *   - the signed-in user who owns it, or
 *   - anyone holding a valid claim token for it.
 *
 * The second case is what lets an anonymous buyer finish their brief before
 * they have an account. It is deliberately narrow: a token grants access to
 * THAT ORDER only, never to a listing, and never to anything the buyer did not
 * themselves enter.
 */

export type AccessGrant =
  | { ok: true; order: CardOrderRow; via: 'owner' | 'token'; userId: string | null }
  | { ok: false; status: 401 | 403 | 404; message: string }

const NOT_FOUND: AccessGrant = {
  ok: false,
  status: 404,
  message: 'That order could not be found.',
}

/**
 * The caller's `users.id`, or null when signed out.
 *
 * Delegates to the dashboard's existing resolver rather than doing its own
 * Clerk-to-users lookup. That resolver already handles the two cases a fresh
 * lookup would silently get wrong: it provisions the users row on first sign-in,
 * and it honours the staff impersonation session, so an OpusFesta admin opening
 * a couple's workspace sees that couple's commissions rather than none.
 */
export async function currentUserId(): Promise<string | null> {
  const user = await getDashboardUser()
  return user?.id ?? null
}

/**
 * @param key   an order id (UUID) or an order_no (OP-CC-2026-0001)
 * @param token the raw claim token from `?t=`, if the caller has one
 */
export async function authorizeOrderAccess(key: string, token?: string | null): Promise<AccessGrant> {
  const userId = await currentUserId()

  // The token path first: an anonymous buyer has nothing else, and a signed-in
  // buyer following their own claim link should not be told "not found" just
  // because the order is not bound to them yet.
  if (token) {
    const check = await verifyClaimToken(token)
    if (check.ok) {
      const matches =
        check.order.id === key || check.order.order_no.toLowerCase() === key.toLowerCase()
      // A valid token for a DIFFERENT order is not a route to that order.
      if (matches) return { ok: true, order: check.order, via: 'token', userId }
    } else if (!userId) {
      // No session to fall back on. Distinguish expiry from garbage, because
      // "your link expired, we can send a new one" is actionable and
      // "not found" is not.
      if (check.reason === 'expired' || check.reason === 'revoked') {
        return {
          ok: false,
          status: 403,
          message: 'That link has expired. Contact support and we will send you a new one.',
        }
      }
      return NOT_FOUND
    }
  }

  const order = key.includes('-') && !key.startsWith('OP-')
    ? await getOrderById(key)
    : await getOrderByNo(key)
  if (!order) return NOT_FOUND

  if (!userId) {
    return { ok: false, status: 401, message: 'Sign in to view this order.' }
  }
  if (order.user_id !== userId) {
    // 404 rather than 403: confirming an order exists is itself information.
    return NOT_FOUND
  }
  return { ok: true, order, via: 'owner', userId }
}
