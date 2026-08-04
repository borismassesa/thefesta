import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Bearer tokens for a guest's card image.
//
// Derived rather than stored, because a retry has to hand back the URL that was
// already sent and the table only ever holds a hash. An HMAC over the three
// immutable identifiers gives that for free: stable across retries, unguessable
// without the secret, and revocable through the asset row rather than by
// changing the key.
//
// ROTATION. Because the token is derived, changing the secret invalidates every
// URL already in a guest's WhatsApp thread, instantly. So there are two: new
// assets always mint from CURRENT, and PREVIOUS is accepted on the way in until
// the compatibility window closes. That makes a rotation a two-deploy operation
// instead of a silent outage.

const DOMAIN = 'opus-card-asset'
const VERSION = 'v1'

export type TokenSubject = {
  designReleaseId: string
  guestId: string
  renderVariant: string
}

/**
 * Domain-separated and versioned.
 *
 * The prefix stops this secret minting values that collide with another token
 * purpose; the version leaves room to change the format without invalidating
 * everything already sent.
 */
function payloadFor(subject: TokenSubject): string {
  return `${DOMAIN}:${VERSION}:${subject.designReleaseId}:${subject.guestId}:${subject.renderVariant}`
}

function sign(secret: string, subject: TokenSubject): string {
  return createHmac('sha256', secret).update(payloadFor(subject)).digest('base64url')
}

/**
 * Secrets in the order they should be tried.
 *
 * CURRENT first, so the common path is one comparison. The legacy single-name
 * variable is still read last, so an environment configured before rotation
 * existed keeps working rather than 404-ing every card mid-send.
 */
function secretsForVerification(): string[] {
  return [
    process.env.CARD_ASSET_TOKEN_SECRET_CURRENT,
    process.env.CARD_ASSET_TOKEN_SECRET_PREVIOUS,
    process.env.CARD_ASSET_TOKEN_SECRET,
  ].filter((value): value is string => Boolean(value))
}

/** The secret new tokens are minted with. Never PREVIOUS. */
function mintingSecret(): string | null {
  return process.env.CARD_ASSET_TOKEN_SECRET_CURRENT ?? process.env.CARD_ASSET_TOKEN_SECRET ?? null
}

/**
 * Mint a token, or null when no secret is configured.
 *
 * Null is a deliberate state, not an error: an environment with no secret is one
 * where the feature is off, and refusing to prepare is better than minting a
 * guessable URL.
 */
export function deriveAssetToken(subject: TokenSubject): string | null {
  const secret = mintingSecret()
  return secret ? sign(secret, subject) : null
}

export function hashAssetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * NOTE ON ROTATION AND LOOKUP.
 *
 * The route does NOT need to try each secret. What is stored is the hash of the
 * token that was actually minted, and the guest presents that same token, so
 * sha256(presented) matches the stored value whichever secret signed it.
 * Rotation is therefore transparent to lookup.
 *
 * Where the two secrets matter is minting: preparation always signs with
 * CURRENT, so an asset first prepared under PREVIOUS keeps its original token
 * and its already-sent URL keeps working, while anything new is on the current
 * key. Retaining PREVIOUS in the verification list guards the case where an
 * asset row is rebuilt and has to reproduce a token that is already in a guest's
 * message thread.
 */

/** True when any configured secret is present. */
export function tokenSecretConfigured(): boolean {
  return secretsForVerification().length > 0
}

/**
 * Constant-time comparison of two hex digests.
 *
 * The indexed lookup on token_hash resolves the row before this is reached, so
 * this is belt and braces rather than the primary defence. It costs nothing and
 * removes the question of whether a later refactor introduced a comparison that
 * leaks by timing.
 */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Strip the extension the public URL carries.
 *
 * The route is `/invite-card/<token>.png` so the URL looks like an image to
 * anything that inspects it, but the dynamic segment then contains the suffix.
 */
export function tokenFromSegment(segment: string): string {
  return segment.endsWith('.png') ? segment.slice(0, -4) : segment
}
