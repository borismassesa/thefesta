import { createSign } from 'node:crypto'
import {
  base64url,
  buildEventTicketClass,
  buildEventTicketObject,
  googleClassId,
  googleObjectId,
  type GoogleWalletConfig,
} from './google-core'
import type { WalletPassModel } from './types'

/**
 * Google Wallet issuance over the REST API.
 *
 * WHY THIS REPLACED THE INLINE PATH. A save link may carry the class and object
 * definitions inside the JWT, and that was the original design: no OAuth, no
 * API calls, issuing a pure function of the admission plus a private key. It
 * had to go for two reasons, in this order of severity:
 *
 * 1. LENGTH. The JWT is base64url, so every field is carried verbatim in the
 *    URL. A real pass — one with a venue, an address and a start and end time —
 *    measured 2,111 characters against Google's ~1,800 guidance. Only a pass
 *    with no venue and no date fitted. That is not a corner case: it is every
 *    wedding. Referencing an object by id instead makes the payload a few dozen
 *    bytes regardless of how much the pass says.
 * 2. EXPOSURE. base64url is not encryption, so the inline link carried the OP1
 *    admission credential in plain sight, and browsers keep URLs in history and
 *    sync them across a signed-in profile. Under this path the credential goes
 *    to Google over TLS in a request body and never appears in the URL.
 *
 * The cost is that issuance can now fail. It talks to two Google endpoints, so
 * a guest tapping Save depends on the network in a way it did not before. That
 * is accepted rather than hedged: there is no fallback to the inline path,
 * because falling back would silently reintroduce both problems above at
 * exactly the moment nobody is watching. A failure is reported as a failure.
 *
 * Kept free of `server-only` and of any database import, and every network call
 * goes through an injected fetch, so the whole flow is asserted in unit tests
 * against a stub rather than against Google.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1'
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer'

/** The subset of `fetch` this module uses. Narrow on purpose, so a test stub is small. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export type GoogleRestOutcome =
  | { ok: true; classId: string; objectId: string }
  | { ok: false; code: string }

/**
 * Exchange the service-account key for an access token.
 *
 * Standard JWT-bearer grant, signed with the same key that signs save links.
 * Deliberately not a library: this is one signature and one form post, and the
 * lockfile churn from adding googleapis has broken this repo's Linux build
 * before.
 */
export function buildTokenAssertion(config: GoogleWalletConfig, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: config.serviceAccountEmail,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat,
    exp: iat + 3600,
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(config.privateKey)
  return `${signingInput}.${base64url(signature)}`
}

interface CachedToken {
  token: string
  /** Epoch ms. Already includes the early-refresh margin. */
  expiresAt: number
}

const tokenCache = new Map<string, CachedToken>()

/**
 * Exchanges already in flight, so a burst of saves costs ONE token request.
 *
 * Without this, every guest who taps Save while the first exchange is still
 * open sees an empty cache and starts their own — the classic stampede, and
 * exactly the shape of traffic this has: nobody saves a pass for hours, then a
 * whole wedding does at once when the link goes out.
 */
const inFlight = new Map<string, Promise<{ ok: true; token: string } | { ok: false; code: string }>>()

/**
 * Refresh a minute before Google would stop accepting the token.
 *
 * Without the margin a token fetched at 3599s is still "valid" here and expired
 * by the time the wallet call lands, which fails one guest's save for reasons
 * no log would explain.
 */
const EXPIRY_MARGIN_MS = 60_000

export async function getAccessToken(
  config: GoogleWalletConfig,
  fetchImpl: FetchLike,
  now: Date = new Date()
): Promise<{ ok: true; token: string } | { ok: false; code: string }> {
  const cached = tokenCache.get(config.serviceAccountEmail)
  if (cached && cached.expiresAt > now.getTime()) return { ok: true, token: cached.token }

  const pending = inFlight.get(config.serviceAccountEmail)
  if (pending) return pending

  const attempt = exchangeToken(config, fetchImpl, now)
  inFlight.set(config.serviceAccountEmail, attempt)
  try {
    return await attempt
  } finally {
    // Cleared whatever the outcome. Leaving a settled failure here would pin
    // every later caller to that one failure for the life of the instance.
    inFlight.delete(config.serviceAccountEmail)
  }
}

async function exchangeToken(
  config: GoogleWalletConfig,
  fetchImpl: FetchLike,
  now: Date
): Promise<{ ok: true; token: string } | { ok: false; code: string }> {
  let body: string
  try {
    body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildTokenAssertion(config, now),
    }).toString()
  } catch {
    // Signing is the only thing here that can throw, and it means the key is
    // malformed. Caught rather than allowed to propagate: the caller's outer
    // handler is written for signing the SAVE link and would report this as
    // sign_failed with OpenSSL fields that are all undefined.
    return { ok: false, code: 'token_sign_failed' }
  }

  let res
  try {
    res = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch {
    // The message can carry the request, and the request carries a signed
    // assertion. The fact of the failure is the whole diagnosis.
    return { ok: false, code: 'token_unreachable' }
  }

  if (!res.ok) return { ok: false, code: `token_http_${res.status}` }

  let parsed: { access_token?: string; expires_in?: number }
  try {
    parsed = JSON.parse(await res.text())
  } catch {
    return { ok: false, code: 'token_malformed' }
  }
  if (!parsed.access_token) return { ok: false, code: 'token_missing' }

  const ttlMs = (parsed.expires_in ?? 3600) * 1000
  tokenCache.set(config.serviceAccountEmail, {
    token: parsed.access_token,
    // max(…, 0) so a pathologically short TTL yields an already-stale entry
    // rather than one dated in the past that still reads as fresh.
    expiresAt: now.getTime() + Math.max(ttlMs - EXPIRY_MARGIN_MS, 0),
  })

  return { ok: true, token: parsed.access_token }
}

/** Test seam. Nothing in production calls this; a key rotation cycles the instance. */
export function resetAccessTokenCache(): void {
  tokenCache.clear()
  inFlight.clear()
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

/**
 * Create or update the event's class.
 *
 * PUT first, POST on 404. The class carries the venue, the date and the couple's
 * names, all of which a host can still be editing the week of the wedding, so
 * it has to be updated rather than created once and left. The other order
 * (POST, then PUT on 409) costs an extra round trip on every save after the
 * first, which is the common case.
 */
export async function upsertEventTicketClass(
  config: GoogleWalletConfig,
  model: WalletPassModel,
  token: string,
  fetchImpl: FetchLike
): Promise<{ ok: true } | { ok: false; code: string }> {
  const classId = googleClassId(config.issuerId, model.eventId)
  const body = JSON.stringify(buildEventTicketClass(config, model))

  let res
  try {
    res = await fetchImpl(`${WALLET_API}/eventTicketClass/${encodeURIComponent(classId)}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body,
    })
  } catch {
    return { ok: false, code: 'class_unreachable' }
  }

  if (res.ok) return { ok: true }
  if (res.status !== 404) return { ok: false, code: `class_http_${res.status}` }

  try {
    res = await fetchImpl(`${WALLET_API}/eventTicketClass`, {
      method: 'POST',
      headers: authHeaders(token),
      body,
    })
  } catch {
    return { ok: false, code: 'class_unreachable' }
  }

  // 409 means a concurrent save created it between our PUT and our POST. The
  // class is there, which is all this function promises.
  if (res.ok || res.status === 409) return { ok: true }
  return { ok: false, code: `class_http_${res.status}` }
}

/**
 * Create the guest's object, or bring an existing one up to date.
 *
 * POST, then PATCH on 409. The 409 is ordinary rather than exceptional: a guest
 * opening their pass page a second time hits it every time.
 *
 * The PATCH is the part worth explaining, because an earlier version of this
 * function treated 409 as simply "done" and that was wrong twice over.
 *
 *   STALE CONTENT. The object id is derived from the invitation and the
 *   credential only, but the object also carries the guest's NAME and the
 *   admission type. Both move without the credential moving — a host fixing a
 *   spelling, or a party going from one to two — and there is no id change to
 *   force a fresh object. Accepting the 409 froze whatever happened to be true
 *   the first time the guest saved, permanently: a couple's pass still reading
 *   "Single", a corrected name still misspelled.
 *
 *   ID COLLISION. googleObjectId truncates the credential id to 8 hex
 *   characters, so two credentials for one invitation collide with probability
 *   around 1 in 4 billion. Rare, but the case it lands on is rotation, which is
 *   the precise thing that id scheme exists to handle: the guest would keep
 *   presenting the REVOKED credential and be refused at the door, with
 *   re-saving unable to repair it.
 *
 * PATCH fixes both, and is safe for the same reason the id is built that way:
 * the credential is not among the things that can change here. A genuinely
 * rotated credential yields a different id and therefore a different object, so
 * this cannot overwrite a live admission with a stale one — and in the collision
 * case it writes the NEW credential over the old, which is the desired outcome.
 *
 * None of this was reachable under the previous inline path, which is why the
 * pass was documented there as un-updatable.
 */
export async function insertEventTicketObject(
  config: GoogleWalletConfig,
  model: WalletPassModel,
  token: string,
  fetchImpl: FetchLike
): Promise<{ ok: true } | { ok: false; code: string }> {
  const body = JSON.stringify(buildEventTicketObject(config, model))

  let res
  try {
    res = await fetchImpl(`${WALLET_API}/eventTicketObject`, {
      method: 'POST',
      headers: authHeaders(token),
      body,
    })
  } catch {
    return { ok: false, code: 'object_unreachable' }
  }

  if (res.ok) return { ok: true }
  if (res.status !== 409) return { ok: false, code: `object_http_${res.status}` }

  const objectId = googleObjectId(config.issuerId, model.invitationId, model.credentialId)
  try {
    res = await fetchImpl(`${WALLET_API}/eventTicketObject/${encodeURIComponent(objectId)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body,
    })
  } catch {
    return { ok: false, code: 'object_unreachable' }
  }

  if (res.ok) return { ok: true }
  // Distinct from object_http_*: this one says the object EXISTS and could not
  // be refreshed, which is a different problem from being unable to create it.
  return { ok: false, code: `object_patch_http_${res.status}` }
}

/**
 * Provision the class and object for one admission.
 *
 * Nothing here reads a response body beyond the token exchange. Google echoes
 * the request in its error payloads, and this request body contains the OP1
 * credential, so the status code is deliberately the only thing that survives
 * into an error code a caller may log.
 */
export async function provisionGooglePass(
  config: GoogleWalletConfig,
  model: WalletPassModel,
  fetchImpl: FetchLike,
  now: Date = new Date()
): Promise<GoogleRestOutcome> {
  const token = await getAccessToken(config, fetchImpl, now)
  if (!token.ok) return { ok: false, code: token.code }

  const klass = await upsertEventTicketClass(config, model, token.token, fetchImpl)
  if (!klass.ok) return { ok: false, code: klass.code }

  const object = await insertEventTicketObject(config, model, token.token, fetchImpl)
  if (!object.ok) return { ok: false, code: object.code }

  return {
    ok: true,
    classId: googleClassId(config.issuerId, model.eventId),
    objectId: googleObjectId(config.issuerId, model.invitationId, model.credentialId),
  }
}
