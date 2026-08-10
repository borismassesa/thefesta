import { createHmac, timingSafeEqual } from 'node:crypto'
import { traceCode } from '@opusfesta/lib'

// NOTE: deliberately NOT marked `server-only`, and deliberately importing no
// Supabase client. Everything here is pure — signing, verifying, parsing, URL
// building — so it stays unit-testable without a Next server context, and a
// stray import from a client component fails at `node:crypto` rather than
// breaking a Turbopack production build. The half that touches storage lives in
// protected-art-storage.ts, which IS server-only.

// Serving catalogue card artwork without handing over the artwork.
//
// THE PROBLEM THIS EXISTS FOR. `website_invitations_products.image_url` holds a
// PUBLIC Supabase storage URL, and the bucket accepts SVG (migration
// 20260528000001). For any product whose artwork is a vector, the complete,
// editable, infinitely-scalable source of a paid-for design was fetchable by
// anyone who could read the page HTML — no session, no referer, nothing this
// application could refuse. Blocking right-click did nothing about that, because
// nobody scraping a catalogue uses right-click.
//
// WHAT THIS CHANGES. Every artwork URL that reaches a browser now points at
// /api/card-art/<productId>, which resolves the storage object SERVER-side and
// streams it back. Three things follow:
//
//   1. The storage path never appears in the page, so the bucket can be made
//      private without the storefront noticing. That flip is what actually
//      closes the hole; this module is what makes the flip possible. Until it
//      happens the old public URLs still work for anyone who already has them.
//   2. Every vector served publicly is trace-stamped on the way out, so a
//      leaked file names the session it was served to.
//   3. There is now ONE place that decides what a stranger may receive, instead
//      of that decision living in a CDN's ACL.
//
// WHAT IT IS NOT. It is not a download blocker. Whoever can see a card can
// capture a card. It removes the anonymous, bulk, full-fidelity copy — which is
// the only version of this problem worth solving.

/**
 * How long a minted artwork URL stays valid.
 *
 * Long enough that a slow page, a background tab, or a Next image-optimizer
 * refetch never lands on a dead token; short enough that a URL pasted into a
 * chat is stale before anyone acts on it.
 *
 * The failure mode of "too short" is BROKEN IMAGES ON THE STOREFRONT, which is
 * far worse than the marginal secrecy of a shorter window, so this errs long.
 */
const TOKEN_TTL_SECONDS = 60 * 60 * 6

export const ARTWORK_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS

/**
 * Expiries are QUANTIZED to the TTL, so the same product yields the same URL
 * for every viewer within a window.
 *
 * This is not a micro-optimisation. `next/image` keys its optimised-output
 * cache on the source URL: a token carrying `Date.now()` would mint a distinct
 * URL on every render, so no two page loads would ever share a cached
 * derivative and Vercel would re-optimise the whole catalogue for every
 * visitor. Quantizing collapses that back to one URL per window.
 *
 * The cost is that a token's real lifetime varies between one and two windows,
 * which is why the window is short relative to how long anything here matters.
 */
function windowExpiry(nowSeconds: number): number {
  return (Math.floor(nowSeconds / TOKEN_TTL_SECONDS) + 2) * TOKEN_TTL_SECONDS
}

const DOMAIN = 'opus-card-art'
const VERSION = 'v1'

/**
 * A fixed value used ONLY outside production.
 *
 * Without it, a developer who has not copied the card secret into .env.local
 * gets a 500 on the entire storefront, which is how this module first shipped
 * and is not an acceptable way to learn about a missing variable. It is a
 * constant in source, so it protects nothing and is never reachable in
 * production — see signingSecret().
 */
const DEV_ONLY_SECRET = 'opus-card-art-development-only-not-a-secret'

/**
 * The signing key, or null when there is none and inventing one would be wrong.
 *
 * Reuses the card asset secret rather than inventing a fourth env var to
 * configure and forget. Domain separation (DOMAIN above) keeps the two token
 * families from ever validating each other's values.
 *
 * RETURNS NULL RATHER THAN THROWING, and that is the whole point. This function
 * is reached while rendering the catalogue, so a throw here takes down the
 * storefront — which is exactly what happened the first time it was written
 * that way. Callers translate null into "serve no artwork", so a missing
 * variable costs the pictures on a page and never the page, and never leaks the
 * artwork it was supposed to protect. Failing closed, loudly, beats failing open
 * or falling over.
 */
function signingSecret(): string | null {
  const secret =
    process.env.CARD_ASSET_TOKEN_SECRET_CURRENT ?? process.env.CARD_ASSET_TOKEN_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV !== 'production') return DEV_ONLY_SECRET

  console.error(
    '[card-art] CARD_ASSET_TOKEN_SECRET_CURRENT is unset in production — ' +
      'card artwork will not be served. Set it to restore the storefront images.',
  )
  return null
}

function sign(payload: string): string | null {
  const secret = signingSecret()
  if (!secret) return null
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/**
 * An expiring credential for one product's artwork.
 *
 * Deliberately NOT viewer-scoped. An earlier cut folded the viewer into the
 * token so the URL and the trace stamp named the same party; that made every
 * URL unique per visitor, which defeats the image cache (see windowExpiry) for
 * no security gain — the route can read the viewer from the request's own
 * cookies, which cannot be spoofed by editing a URL the way an embedded
 * audience could. The stamp is still per-viewer; only the URL is shared.
 */
export function mintArtworkToken(
  productId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  const expiry = windowExpiry(nowSeconds)
  const signature = sign(`${DOMAIN}:${VERSION}:${productId}:${expiry}`)
  return signature && `${expiry}.${signature}`
}

export type TokenCheck =
  | { ok: true }
  | { ok: false; reason: 'malformed' | 'expired' | 'bad_signature' }

/**
 * Verifies a token against one product.
 *
 * Order matters: expiry is checked BEFORE the signature comparison so an
 * expired-but-valid token cannot be distinguished from a forged one by timing.
 * Both end at the same 404 upstream regardless.
 */
export function verifyArtworkToken(
  productId: string,
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): TokenCheck {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }

  const [expiryRaw, signature] = parts
  const expiry = Number(expiryRaw)
  if (!Number.isSafeInteger(expiry)) return { ok: false, reason: 'malformed' }
  if (expiry < nowSeconds) return { ok: false, reason: 'expired' }

  const expected = sign(`${DOMAIN}:${VERSION}:${productId}:${expiry}`)
  if (!expected) return { ok: false, reason: 'bad_signature' }
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' }
  }
  return { ok: true }
}

/**
 * Which of a product's images is being asked for.
 *
 * `hero` is the card artwork itself — the vector, the one worth stealing.
 * `d<n>` and `g<n>` index the `designs` and `gallery` arrays, the extra views
 * shown in the product carousel. They are separate slots rather than separate
 * tokens because they are all views of ONE product: anyone entitled to see the
 * card is entitled to see its other angles, so binding each to its own signature
 * would add ceremony without adding a boundary.
 */
export type ArtworkSlot = 'hero' | `d${number}` | `g${number}`

/** Parses a slot back from the query string, refusing anything unrecognised. */
export function parseSlot(raw: string | null): ArtworkSlot | null {
  if (!raw || raw === 'hero') return 'hero'
  const match = raw.match(/^([dg])(\d{1,2})$/)
  if (!match) return null
  return `${match[1] as 'd' | 'g'}${Number(match[2])}` as ArtworkSlot
}

/**
 * The public URL for one of a product's images.
 *
 * Every surface that used to interpolate a storage URL gets this instead.
 * Same-origin, so `next/image` needs no remotePatterns entry and the browser
 * sends no cross-origin request a CDN could serve behind our back.
 */
export function artworkUrl(productId: string, slot: ArtworkSlot = 'hero'): string | null {
  const token = mintArtworkToken(productId)
  if (!token) return null
  const suffix = slot === 'hero' ? '' : `&s=${slot}`
  return `/api/card-art/${encodeURIComponent(productId)}?t=${token}${suffix}`
}

/**
 * The trace code stamped into artwork served to this viewer.
 *
 * Keyed, so the code cannot be computed by whoever holds a leaked card, and
 * derived from the same audience string the token carries.
 */
export function artworkTraceCode(productId: string, audience: string): string {
  const secret = signingSecret()
  // Unreachable in practice: the route has already verified a signature, which
  // is impossible without a secret. Kept total rather than asserted so a future
  // caller cannot turn a config gap into a crash mid-response.
  if (!secret) return 'UNSIGNED'
  const digest = createHmac('sha256', secret)
    .update(`${DOMAIN}:trace:${productId}:${audience}`)
    .digest('hex')
  return traceCode(digest)
}

/**
 * Splits a Supabase public storage URL back into bucket and object path.
 *
 * Needed because the column stores a rendered public URL rather than a path.
 * Parsing it here — instead of storing paths — keeps this change to the read
 * side, so no backfill has to run before the storefront is protected.
 *
 * Returns null for anything that is not a Supabase storage URL (a local
 * `/assets/...` path, an external CDN, an empty column).
 */
export function parseStorageUrl(
  url: string,
): { bucket: string; path: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  // Both shapes appear in this codebase's history.
  const match = parsed.pathname.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
  )
  if (!match) return null
  return { bucket: match[1], path: decodeURIComponent(match[2]) }
}
