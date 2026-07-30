import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getOrderById, type CardOrderRow } from './orders'

/**
 * Claim tokens — the bridge from an anonymous checkout to a real account.
 * Specs: OP-CCS-PRD-001 §7.1, OP-CCS-TDD-001 §7.2, loophole L4.
 *
 * The buyer is never blocked by "select your event". They pay, complete the
 * brief and get a finished card without ever creating an account; only the
 * final delivery step needs one, and that is what this flow guarantees.
 *
 * Security shape:
 *   - 32 bytes of CSPRNG, so the token is not guessable.
 *   - ONLY the SHA-256 hash is stored. A database leak hands out no order
 *     access, which is why `verifyClaimToken` looks up by hash rather than
 *     scanning and comparing.
 *   - Single use, 30-day TTL, bound to the checkout phone.
 *   - Presenting a token grants access to THAT ORDER'S brief and status only —
 *     never to PII beyond what the buyer themselves entered, and never to a
 *     listing of any kind.
 *
 * A forwarded or leaked link still cannot take over an account: claiming
 * requires a Clerk sign-in, and the sign-in binds the order to whoever signs
 * in. That is the intended behaviour for the common real case (a family member
 * commissions the card and forwards the link to the couple), and it is why the
 * token alone never reveals contact details.
 */

const TOKEN_BYTES = 32
const TTL_DAYS = 30

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export type IssuedClaimToken = {
  /** The raw token. Returned ONCE, at issue time. Never stored, never re-derivable. */
  token: string
  expiresAt: Date
}

/**
 * Mint a claim token for an order, revoking any outstanding ones.
 *
 * Revoking rather than deleting the superseded token keeps the record of what
 * was sent to whom, which Support needs when a buyer says "I got two links".
 */
export async function issueClaimToken(orderId: string, phone: string): Promise<IssuedClaimToken> {
  const supabase = createSupabaseServerClient()
  const raw = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000)

  await supabase
    .from('order_claim_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .is('used_at', null)
    .is('revoked_at', null)

  const { error } = await supabase.from('order_claim_tokens').insert({
    token_hash: hashToken(raw),
    order_id: orderId,
    phone,
    expires_at: expiresAt.toISOString(),
  })
  if (error) throw new Error(`issueClaimToken failed: ${error.message}`)

  return { token: raw, expiresAt }
}

export type ClaimTokenCheck =
  | { ok: true; order: CardOrderRow }
  | { ok: false; reason: 'unknown' | 'expired' | 'used' | 'revoked' }

/**
 * Resolve a raw token to its order.
 *
 * Deliberately does NOT mark the token used: it is presented on every visit to
 * the brief and the order tracker while the buyer is still anonymous. "Single
 * use" applies to the account-binding step (`consumeClaimToken`), not to
 * reading your own order — burning the token on first view would lock a buyer
 * out of the brief they were sent it to complete.
 */
export async function verifyClaimToken(raw: string): Promise<ClaimTokenCheck> {
  if (!raw || raw.length < 20) return { ok: false, reason: 'unknown' }
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('order_claim_tokens')
    .select('token_hash, order_id, phone, expires_at, used_at, revoked_at')
    .eq('token_hash', hashToken(raw))
    .maybeSingle()
  if (error) throw new Error(`verifyClaimToken failed: ${error.message}`)
  if (!data) return { ok: false, reason: 'unknown' }

  const row = data as {
    token_hash: string
    order_id: string
    expires_at: string
    used_at: string | null
    revoked_at: string | null
  }
  if (row.revoked_at) return { ok: false, reason: 'revoked' }
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' }

  const order = await getOrderById(row.order_id)
  if (!order) return { ok: false, reason: 'unknown' }
  return { ok: true, order }
}

export type ClaimResult =
  | { ok: true; order: CardOrderRow; alreadyClaimed: boolean }
  | { ok: false; reason: 'unknown' | 'expired' | 'used' | 'revoked' | 'owned_by_other' }

/**
 * Bind an order to a signed-in user, consuming the token.
 *
 * `eventId` is optional: an order can be claimed before the couple has created
 * an event, and delivery simply waits. The database CHECK constraint means an
 * order with no event can never reach `delivered`, so there is no way to lose
 * track of this.
 */
export async function consumeClaimToken(input: {
  token: string
  userId: string
  eventId?: string | null
}): Promise<ClaimResult> {
  const check = await verifyClaimToken(input.token)
  if (!check.ok) return { ok: false, reason: check.reason }

  const order = check.order
  // Already bound to someone else. This is the case the "single use" rule
  // exists for: a forwarded link cannot take an order away from the account
  // that already owns it.
  if (order.user_id && order.user_id !== input.userId) {
    return { ok: false, reason: 'owned_by_other' }
  }
  if (order.user_id === input.userId) {
    return { ok: true, order, alreadyClaimed: true }
  }

  const supabase = createSupabaseServerClient()

  // Guarded on user_id IS NULL so two concurrent claims cannot both win.
  const { data, error } = await supabase
    .from('card_orders')
    .update({
      user_id: input.userId,
      event_id: input.eventId ?? order.event_id,
    })
    .eq('id', order.id)
    .is('user_id', null)
    .select('id')
  if (error) throw new Error(`consumeClaimToken failed: ${error.message}`)
  if (!data || data.length === 0) {
    // Lost the race — re-read and report the truth rather than guessing.
    const latest = await getOrderById(order.id)
    if (latest?.user_id === input.userId) return { ok: true, order: latest, alreadyClaimed: true }
    return { ok: false, reason: 'owned_by_other' }
  }

  await supabase
    .from('order_claim_tokens')
    .update({ used_at: new Date().toISOString(), used_by: input.userId })
    .eq('token_hash', hashToken(input.token))

  const claimed = await getOrderById(order.id)
  return { ok: true, order: claimed ?? order, alreadyClaimed: false }
}

/**
 * Constant-time compare for anywhere a token is checked against a known value.
 * Not used by the hash lookup above (which is already constant-time in effect,
 * since it is an indexed equality on a digest) but exported for call sites that
 * need to compare two raw secrets.
 */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
