import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import test from 'node:test'
import {
  buildTokenAssertion,
  getAccessToken,
  insertEventTicketObject,
  provisionGooglePass,
  resetAccessTokenCache,
  upsertEventTicketClass,
  type FetchLike,
} from './google-rest'
import type { WalletPassModel } from './types'

/**
 * Unit suite for Google Wallet REST issuance.
 *
 *   npx tsx --test src/lib/wallet/google-rest.test.ts
 *
 * Every call goes through an injected fetch, so this asserts the exact requests
 * Google would receive without touching the network. The properties that matter
 * most are the ones about where the credential goes: it belongs in one request
 * BODY and must never reach a URL, the shared class, or an error code.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const CONFIG = {
  issuerId: '3388000000023183279',
  serviceAccountEmail: 'opuspass-wallet-issuer@opusfesta-498919.iam.gserviceaccount.com',
  privateKey,
  origin: 'https://opuspass.opusfesta.com',
  assetOrigin: 'https://opuspass.opusfesta.com',
}

const MODEL: WalletPassModel = {
  invitationId: '44444444-0000-0000-0000-000000000001',
  eventId: '22222222-2222-2222-2222-222222222222',
  eventName: 'Samwel & Julieth',
  guestName: 'Fabiola Thomas',
  venueName: 'Hyatt Regency Hall',
  venueAddress: 'Dodoma',
  startsAt: '2026-12-12T15:00:00Z',
  endsAt: null,
  ticketType: 'Single',
  entryAllowance: 1,
  credential: `OP1:${'Vnb7K0m3Yw9lN6AzR8FzJ4Gq1pE'}${'abcdefghijklmnop'}`,
  credentialId: '11111111-2222-3333-4444-555555555555',
}

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

/** A fetch stub that records every call and answers from a scripted queue. */
function stubFetch(
  responses: ({ status: number; body?: string } | { throws: true })[]
): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = []
  let i = 0
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body })
    const next = responses[i++] ?? { status: 500 }
    if ('throws' in next) throw new Error('network is down')
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => next.body ?? '',
    }
  }
  return { fetch, calls }
}

const TOKEN_OK = { status: 200, body: JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }) }

test.beforeEach(() => resetAccessTokenCache())

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

test('the token assertion is signed and carries the claims Google requires', () => {
  const jwt = buildTokenAssertion(CONFIG, new Date('2026-08-04T00:00:00Z'))
  const [header, payload, signature] = jwt.split('.')

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${header}.${payload}`)
  assert.ok(verifier.verify(publicKey, Buffer.from(signature, 'base64url')))

  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  assert.equal(claims.iss, CONFIG.serviceAccountEmail)
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token')
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/wallet_object.issuer')
  // An assertion that never expires is a bearer credential with no end date.
  assert.equal(claims.exp - claims.iat, 3600)
})

test('a token is reused rather than re-fetched on every save', async () => {
  const { fetch, calls } = stubFetch([TOKEN_OK])
  const now = new Date('2026-08-04T00:00:00Z')

  const first = await getAccessToken(CONFIG, fetch, now)
  const second = await getAccessToken(CONFIG, fetch, new Date(now.getTime() + 60_000))

  assert.deepEqual([first, second], [
    { ok: true, token: 'ya29.test' },
    { ok: true, token: 'ya29.test' },
  ])
  assert.equal(calls.length, 1, 'the second save should not have hit the token endpoint')
})

test('a token is refreshed BEFORE Google stops accepting it', async () => {
  const { fetch, calls } = stubFetch([TOKEN_OK, TOKEN_OK])
  const now = new Date('2026-08-04T00:00:00Z')
  await getAccessToken(CONFIG, fetch, now)

  // 3,570s in: still inside the nominal hour, but past the 60s margin. Without
  // the margin this reuses a token that expires mid-flight, failing one guest's
  // save for a reason no log would explain.
  await getAccessToken(CONFIG, fetch, new Date(now.getTime() + 3_570_000))
  assert.equal(calls.length, 2)
})

test('token failures are reported as short codes, never as bodies', async () => {
  for (const [responses, expected] of [
    [[{ status: 401, body: 'assertion contains the signed key material' }], 'token_http_401'],
    [[{ status: 200, body: 'not json' }], 'token_malformed'],
    [[{ status: 200, body: '{}' }], 'token_missing'],
    [[{ throws: true as const }], 'token_unreachable'],
  ] as const) {
    resetAccessTokenCache()
    const { fetch } = stubFetch([...responses])
    const result = await getAccessToken(CONFIG, fetch)
    assert.deepEqual(result, { ok: false, code: expected })
  }
})

test('a failed token exchange is not cached as if it had succeeded', async () => {
  const { fetch, calls } = stubFetch([{ status: 500 }, TOKEN_OK])
  assert.equal((await getAccessToken(CONFIG, fetch)).ok, false)
  assert.deepEqual(await getAccessToken(CONFIG, fetch), { ok: true, token: 'ya29.test' })
  assert.equal(calls.length, 2, 'the retry must actually re-request')
})

test('a burst of simultaneous saves costs one token request, not one each', async () => {
  // The traffic this actually sees: nothing for hours, then a whole wedding at
  // once when the link goes out. Awaiting sequentially cannot catch this — the
  // cache is already warm by the second call — so these must overlap.
  const { fetch, calls } = stubFetch([TOKEN_OK])
  const results = await Promise.all(
    Array.from({ length: 8 }, () => getAccessToken(CONFIG, fetch))
  )

  assert.equal(calls.length, 1, `${calls.length} token requests for one burst`)
  for (const r of results) assert.deepEqual(r, { ok: true, token: 'ya29.test' })
})

test('a failure shared by a burst does not pin later callers to it', async () => {
  // The in-flight entry must be cleared on failure too. Left in place, every
  // later save for the life of the instance would resolve to this one failure.
  const { fetch } = stubFetch([{ status: 500 }, TOKEN_OK])
  const failed = await Promise.all([getAccessToken(CONFIG, fetch), getAccessToken(CONFIG, fetch)])
  for (const r of failed) assert.equal(r.ok, false)

  assert.deepEqual(await getAccessToken(CONFIG, fetch), { ok: true, token: 'ya29.test' })
})

test('an unusable private key is named as such, not as a save-link signing fault', async () => {
  // providers.ts wraps issuance in a catch written for signing the SAVE link,
  // and would report this as sign_failed with OpenSSL fields that are all
  // undefined. Naming it here is what makes the log point at the real cause.
  const broken = { ...CONFIG, privateKey: '-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----' }
  const { fetch, calls } = stubFetch([TOKEN_OK])
  assert.deepEqual(await getAccessToken(broken, fetch), { ok: false, code: 'token_sign_failed' })
  assert.equal(calls.length, 0, 'nothing should have been sent to Google')
})

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

test('an existing class is updated in one call', async () => {
  const { fetch, calls } = stubFetch([{ status: 200 }])
  assert.deepEqual(await upsertEventTicketClass(CONFIG, MODEL, 't', fetch), { ok: true })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'PUT')
  assert.ok(calls[0].url.endsWith(`/eventTicketClass/${CONFIG.issuerId}.event_22222222-2222-2222-2222-222222222222`))
  assert.equal(calls[0].headers.authorization, 'Bearer t')
})

test('a class that does not exist yet is created', async () => {
  const { fetch, calls } = stubFetch([{ status: 404 }, { status: 200 }])
  assert.deepEqual(await upsertEventTicketClass(CONFIG, MODEL, 't', fetch), { ok: true })

  assert.deepEqual(calls.map((c) => c.method), ['PUT', 'POST'])
  assert.ok(calls[1].url.endsWith('/eventTicketClass'))
})

test('two guests saving at once do not fail on the losing create', async () => {
  // The first save PUTs (404), then POSTs — and in between, a concurrent save
  // created the class. 409 means it is there, which is all this promises.
  const { fetch } = stubFetch([{ status: 404 }, { status: 409 }])
  assert.deepEqual(await upsertEventTicketClass(CONFIG, MODEL, 't', fetch), { ok: true })
})

test('a class error that is not 404 does not fall through to a create', async () => {
  const { fetch, calls } = stubFetch([{ status: 403 }])
  assert.deepEqual(await upsertEventTicketClass(CONFIG, MODEL, 't', fetch), {
    ok: false,
    code: 'class_http_403',
  })
  assert.equal(calls.length, 1, 'a permissions failure must not be retried as a create')
})

// ---------------------------------------------------------------------------
// Object
// ---------------------------------------------------------------------------

test('re-saving the same pass refreshes it rather than erroring', async () => {
  // A guest opening their pass page twice is the ordinary case, not a fault.
  const { fetch, calls } = stubFetch([{ status: 409 }, { status: 200 }])
  assert.deepEqual(await insertEventTicketObject(CONFIG, MODEL, 't', fetch), { ok: true })

  assert.deepEqual(calls.map((c) => c.method), ['POST', 'PATCH'])
})

test('a corrected name or party size reaches a pass the guest already saved', async () => {
  // The defect that made 409-as-success wrong. The object id comes from the
  // invitation and credential only, but the object carries the NAME and the
  // admission type — and those move without the credential moving. Accepting
  // the 409 froze a couple's pass reading "Single" forever, with no id change
  // able to force a fresh object.
  const { fetch, calls } = stubFetch([{ status: 409 }, { status: 200 }])
  const corrected = { ...MODEL, guestName: 'Fabiola Thomas-Mushi', ticketType: 'Double', entryAllowance: 2 }
  assert.deepEqual(await insertEventTicketObject(CONFIG, corrected, 't', fetch), { ok: true })

  const patch = calls[1]
  assert.equal(patch.method, 'PATCH')
  assert.ok(patch.url.endsWith(`/eventTicketObject/${CONFIG.issuerId}.adm_44444444-0000-0000-0000-000000000001_11111111`))
  assert.ok(patch.body.includes('Fabiola Thomas-Mushi'))
  assert.ok(patch.body.includes('Double'))
})

test('a rotated credential is written over a colliding object rather than left stale', async () => {
  // googleObjectId truncates the credential id to 8 hex characters, so two
  // credentials for one invitation collide about once in 4 billion. The case it
  // lands on is rotation, and accepting the 409 would leave the guest
  // presenting the REVOKED credential, refused at the door, with re-saving
  // unable to repair it.
  const rotated = { ...MODEL, credential: `OP1:${'Zz9'.padEnd(43, 'x')}`, credentialId: MODEL.credentialId }
  const { fetch, calls } = stubFetch([{ status: 409 }, { status: 200 }])
  assert.deepEqual(await insertEventTicketObject(CONFIG, rotated, 't', fetch), { ok: true })

  assert.ok(calls[1].body.includes(rotated.credential), 'the new credential must be written')
  assert.equal(calls[1].body.includes(MODEL.credential), false)
})

test('an object that exists but cannot be refreshed is distinguishable', async () => {
  // A different problem from being unable to create it, and the code says so.
  const { fetch } = stubFetch([{ status: 409 }, { status: 403 }])
  assert.deepEqual(await insertEventTicketObject(CONFIG, MODEL, 't', fetch), {
    ok: false,
    code: 'object_patch_http_403',
  })
})

test('an object failure is reported with its status', async () => {
  const { fetch } = stubFetch([{ status: 400, body: 'echoes the whole request' }])
  assert.deepEqual(await insertEventTicketObject(CONFIG, MODEL, 't', fetch), {
    ok: false,
    code: 'object_http_400',
  })
})

test('a network failure on the class CREATE leg is reported, not swallowed', async () => {
  // The PUT-leg throw was covered; the POST fallback's own failure was not.
  const { fetch } = stubFetch([{ status: 404 }, { throws: true }])
  assert.deepEqual(await upsertEventTicketClass(CONFIG, MODEL, 't', fetch), {
    ok: false,
    code: 'class_unreachable',
  })
})

test('a rotated credential provisions a different object end to end', async () => {
  // The guarantee the whole design leans on, asserted through the real flow
  // rather than through googleObjectId alone.
  const { fetch } = stubFetch([TOKEN_OK, { status: 200 }, { status: 200 }])
  const first = await provisionGooglePass(CONFIG, MODEL, fetch)

  resetAccessTokenCache()
  const second = stubFetch([TOKEN_OK, { status: 200 }, { status: 200 }])
  const rotated = await provisionGooglePass(
    CONFIG,
    { ...MODEL, credential: `OP1:${'Qq1'.padEnd(43, 'y')}`, credentialId: '99999999-8888-7777-6666-555555555555' },
    second.fetch
  )

  assert.ok(first.ok && rotated.ok)
  assert.notEqual(first.objectId, rotated.objectId)
  // Same event, so the class is shared: a rotation must not fork the event.
  assert.equal(first.classId, rotated.classId)
})

// ---------------------------------------------------------------------------
// The whole flow
// ---------------------------------------------------------------------------

test('provisioning creates the class before the object', async () => {
  const { fetch, calls } = stubFetch([TOKEN_OK, { status: 200 }, { status: 200 }])
  const result = await provisionGooglePass(CONFIG, MODEL, fetch)

  assert.deepEqual(result, {
    ok: true,
    classId: `${CONFIG.issuerId}.event_22222222-2222-2222-2222-222222222222`,
    objectId: `${CONFIG.issuerId}.adm_44444444-0000-0000-0000-000000000001_11111111`,
  })
  // Order matters: an object referencing a class that does not exist is
  // rejected, so this sequence is load-bearing rather than incidental.
  assert.deepEqual(
    calls.map((c) => c.url.replace('https://walletobjects.googleapis.com/walletobjects/v1', '')),
    [
      'https://oauth2.googleapis.com/token',
      `/eventTicketClass/${CONFIG.issuerId}.event_22222222-2222-2222-2222-222222222222`,
      '/eventTicketObject',
    ]
  )
})

test('a token failure stops before anything is created at Google', async () => {
  const { fetch, calls } = stubFetch([{ status: 401 }])
  assert.deepEqual(await provisionGooglePass(CONFIG, MODEL, fetch), {
    ok: false,
    code: 'token_http_401',
  })
  assert.equal(calls.length, 1)
})

test('a class failure stops before the object is created', async () => {
  const { fetch, calls } = stubFetch([TOKEN_OK, { status: 403 }])
  assert.deepEqual(await provisionGooglePass(CONFIG, MODEL, fetch), {
    ok: false,
    code: 'class_http_403',
  })
  assert.equal(calls.length, 2, 'no object should be created against a class that failed')
})

// ---------------------------------------------------------------------------
// Where the credential is allowed to go
// ---------------------------------------------------------------------------

test('the credential travels in exactly one request body and no URL', async () => {
  const { fetch, calls } = stubFetch([TOKEN_OK, { status: 200 }, { status: 200 }])
  await provisionGooglePass(CONFIG, MODEL, fetch)

  // A URL is logged by proxies, kept in history and echoed in error reporting.
  for (const call of calls) {
    assert.equal(call.url.includes(MODEL.credential), false, `credential leaked into ${call.url}`)
  }

  const carrying = calls.filter((c) => c.body.includes(MODEL.credential))
  assert.equal(carrying.length, 1, 'credential should be in exactly one body')
  assert.ok(carrying[0].url.endsWith('/eventTicketObject'))
})

test('the shared class never carries one guest\'s credential', async () => {
  // The class is shared by every guest at the event, so a credential landing
  // there would hand one guest's admission to all of them.
  const { fetch, calls } = stubFetch([TOKEN_OK, { status: 200 }, { status: 200 }])
  await provisionGooglePass(CONFIG, MODEL, fetch)

  const klass = calls.find((c) => c.url.includes('/eventTicketClass'))
  assert.ok(klass)
  assert.equal(klass.body.includes(MODEL.credential), false)
})

test('every error code fits the column that stores it', async () => {
  // wallet_passes.last_error_code is bounded at 64 characters precisely so a
  // provider payload cannot be smuggled into the table. A code that overflowed
  // would be silently truncated by record_wallet_pass and stop identifying the
  // fault.
  const cases: ({ status: number; body?: string } | { throws: true })[][] = [
    [{ status: 401 }],
    [{ status: 200, body: 'not json' }],
    [{ throws: true }],
    [TOKEN_OK, { status: 403 }],
    [TOKEN_OK, { throws: true }],
    [TOKEN_OK, { status: 404 }, { throws: true }],
    [TOKEN_OK, { status: 200 }, { status: 400 }],
    [TOKEN_OK, { status: 200 }, { throws: true }],
    [TOKEN_OK, { status: 200 }, { status: 409 }, { status: 403 }],
    [TOKEN_OK, { status: 200 }, { status: 409 }, { throws: true }],
  ]
  for (const responses of cases) {
    resetAccessTokenCache()
    const { fetch } = stubFetch(responses)
    const result = await provisionGooglePass(CONFIG, MODEL, fetch)
    assert.equal(result.ok, false)
    if (result.ok) continue
    assert.ok(result.code.length <= 64, `code too long: ${result.code}`)
    // Codes are identifiers, not prose lifted from a provider response.
    assert.match(result.code, /^[a-z0-9_]+$/)
  }
})
