import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'
import { BeemSmsProvider, beemAuthHeader, buildBeemPayload, type BeemConfig } from './beem'
import { selectSmsProvider } from './select'
import { SMS_PURPOSES } from './purpose'

/**
 * Run with:
 *   npx tsx --test src/lib/sms/beem.test.ts
 *
 * Beem's response shape is unconfirmed against a live account, so these tests
 * assert what we control — the request we send, the credentials we never leak,
 * and how we behave when the gateway is slow, unreachable or unhappy — rather
 * than pinning a response format we have only read about.
 */

const API_KEY = 'ak_live_SECRETKEY123'
const SECRET_KEY = 'sk_live_TOPSECRET456'

const CFG: BeemConfig = {
  apiKey: API_KEY,
  secretKey: SECRET_KEY,
  senderId: 'OpusPass',
  baseUrl: 'https://apisms.beem.africa',
  timeoutMs: 50,
  debugResponse: false,
}

interface Capture {
  url: string
  init: RequestInit
}

const realFetch = globalThis.fetch
let captured: Capture[] = []
let logged: unknown[][] = []
const realWarn = console.warn

/**
 * The stub honours `init.signal`, because the provider's timeout is expressed
 * entirely as an `AbortSignal` — a stub that ignored it would let the timeout
 * test pass against a provider that had no timeout at all.
 */
function stubFetch(handler: () => Promise<Response>) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} })
    const signal = init?.signal
    if (!signal) return handler()
    return Promise.race([
      handler(),
      new Promise<Response>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
    ])
  }) as typeof fetch
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  captured = []
  logged = []
  // Capturing rather than printing: the leakage tests assert on what the
  // provider wrote, which means intercepting the real logger.
   
  console.warn = (...args: unknown[]) => void logged.push(args)
})

afterEach(() => {
  globalThis.fetch = realFetch
   
  console.warn = realWarn
})

// ── Request shape ─────────────────────────────────────────────────────────

test('the payload matches the documented Beem send body', () => {
  const payload = buildBeemPayload('OpusPass', 'Karibu', [
    { recipientId: 'invitation:255712345678', phone: '255712345678' },
  ])
  assert.deepEqual(payload, {
    source_addr: 'OpusPass',
    encoding: 0,
    schedule_time: '',
    message: 'Karibu',
    recipients: [{ recipient_id: 'invitation:255712345678', dest_addr: '255712345678' }],
  })
})

test('auth is HTTP Basic with the API key as user and secret as password', () => {
  const header = beemAuthHeader('user', 'pass')
  assert.equal(header, `Basic ${Buffer.from('user:pass').toString('base64')}`)
  assert.equal(Buffer.from(header.slice('Basic '.length), 'base64').toString(), 'user:pass')
})

test('a send posts to /v1/send with the auth header and normalized recipient', async () => {
  stubFetch(async () => jsonResponse(200, { successful: true, request_id: 9912 }))
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Karibu')

  assert.equal(captured.length, 1)
  assert.equal(captured[0].url, 'https://apisms.beem.africa/v1/send')
  assert.equal(captured[0].init.method, 'POST')

  const headers = captured[0].init.headers as Record<string, string>
  assert.equal(headers.Authorization, beemAuthHeader(API_KEY, SECRET_KEY))
  assert.equal(headers['Content-Type'], 'application/json')

  const sent = JSON.parse(String(captured[0].init.body))
  // The local-format number reached the gateway in canonical form.
  assert.equal(sent.recipients[0].dest_addr, '255712345678')
  assert.equal(sent.source_addr, 'OpusPass')

  assert.equal(result.ok, true)
  assert.equal(result.provider, 'beem')
  assert.equal(result.requestId, '9912')
  assert.equal(result.httpStatus, 200)
})

test('an unusable number never reaches the network', async () => {
  stubFetch(async () => jsonResponse(200, { successful: true }))
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('+254712345678', 'Karibu')
  assert.equal(captured.length, 0)
  assert.equal(result.ok, false)
  // The number itself is not echoed back — this string is rendered in the UI.
  assert.equal(result.error?.includes('254712345678'), false)
})

test('an empty body never reaches the network', async () => {
  stubFetch(async () => jsonResponse(200, { successful: true }))
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', '   ')
  assert.equal(captured.length, 0)
  assert.equal(result.ok, false)
})

// ── Failure handling ──────────────────────────────────────────────────────

test('a non-2xx response is a failure carrying the HTTP status', async () => {
  stubFetch(async () => jsonResponse(401, { code: 100, message: 'Invalid credentials' }))
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Karibu')
  assert.equal(result.ok, false)
  assert.equal(result.httpStatus, 401)
  assert.equal(result.providerCode, 100)
  assert.equal(result.error, 'Invalid credentials')
})

test('a non-JSON error body still yields a usable failure', async () => {
  stubFetch(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }))
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Karibu')
  assert.equal(result.ok, false)
  assert.equal(result.httpStatus, 502)
  assert.equal(result.error, 'Gateway returned HTTP 502')
})

test('a 2xx that reports successful:false is a failure, not a send', async () => {
  stubFetch(async () => jsonResponse(200, { successful: false, message: 'Insufficient balance' }))
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Karibu')
  assert.equal(result.ok, false)
  assert.equal(result.error, 'Insufficient balance')
})

test('a timeout fails closed and names the limit', async () => {
  stubFetch(async () => {
    await new Promise((r) => setTimeout(r, 200))
    return jsonResponse(200, { successful: true })
  })
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Karibu')
  assert.equal(result.ok, false)
  assert.ok(result.error?.includes('timed out'))
  assert.equal(result.httpStatus, undefined)
})

test('a network failure does not surface the raw thrown error', async () => {
  stubFetch(async () => {
    throw new Error(`connect ECONNREFUSED https://${API_KEY}@apisms.beem.africa`)
  })
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Karibu')
  assert.equal(result.ok, false)
  assert.equal(result.error, 'Gateway unreachable')
  assert.equal(result.error.includes(API_KEY), false)
})

// ── Leakage ───────────────────────────────────────────────────────────────

test('no credential appears in any log line or returned result', async () => {
  stubFetch(async () =>
    // The nastiest realistic case: a gateway that echoes the credentials it
    // rejected straight back in the error body.
    jsonResponse(403, { message: `bad auth for ${API_KEY}:${SECRET_KEY}`, request_id: 77 }),
  )
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Karibu')

  const dump = JSON.stringify(logged) + JSON.stringify(result)
  assert.equal(dump.includes(API_KEY), false)
  assert.equal(dump.includes(SECRET_KEY), false)
  // The identifier we actually need from the exchange survives.
  assert.equal(result.requestId, '77')
})

test('the guest number and message body stay out of the log', async () => {
  stubFetch(async () => jsonResponse(200, { successful: true, request_id: 5, recipients: [{ dest_addr: '255712345678' }] }))
  await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Namba yako ni AB12CD34')

  const dump = JSON.stringify(logged)
  assert.equal(dump.includes('255712345678'), false)
  assert.equal(dump.includes('AB12CD34'), false)
  // Still enough to debug with: masked number, request id, status.
  assert.ok(dump.includes('25571'))
  assert.ok(dump.includes('requestId'))
})

test('the response body is NOT logged by default, only its field names', async () => {
  // The shape is what designing persistence needs; the values are a standing
  // disclosure of whatever the gateway chose to echo back.
  stubFetch(async () =>
    jsonResponse(200, {
      successful: true,
      request_id: 5,
      undocumented_field: 'sensitive value',
      recipients: [{ dest_addr: '255712345678', status: 'QUEUED' }],
    }),
  )
  await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Karibu')

  const dump = JSON.stringify(logged)
  assert.equal(dump.includes('sensitive value'), false)
  assert.equal(dump.includes('QUEUED'), false)
  // The key names survive — including ones we have never seen before.
  assert.ok(dump.includes('undocumented_field'))
  assert.ok(dump.includes('recipients'))
  assert.ok(dump.includes('responseKeys'))
})

test('full capture happens only when the debug switch is on, still redacted', async () => {
  stubFetch(async () =>
    jsonResponse(200, {
      successful: true,
      undocumented_field: 'sensitive value',
      recipients: [{ dest_addr: '255712345678' }],
      echoed_key: API_KEY,
    }),
  )
  await new BeemSmsProvider({ ...CFG, debugResponse: true }, 'invitation').sendText('0712345678', 'Karibu')

  const dump = JSON.stringify(logged)
  assert.ok(dump.includes('sensitive value'))
  // Even in debug mode the credential and the recipient number do not survive.
  assert.equal(dump.includes(API_KEY), false)
  assert.equal(dump.includes('255712345678'), false)
})

// ── Encoding contract ─────────────────────────────────────────────────────

test('a message needing Unicode is refused before it costs anything', async () => {
  stubFetch(async () => jsonResponse(200, { successful: true }))
  // We send encoding: 0 unconditionally, and Beem's behaviour for non-GSM
  // content under that flag is unknown. Refusing is the only outcome we can
  // predict.
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'Karibu ’na’ 😀')
  assert.equal(captured.length, 0)
  assert.equal(result.ok, false)
  assert.equal(result.encoding, 'unicode')
  // The error names the offending characters so they can be removed.
  assert.ok(result.error?.includes('’'))
  assert.ok(result.error?.includes('😀'))
})

test('a GSM-7 message reports the segments it was billed as', async () => {
  stubFetch(async () => jsonResponse(200, { successful: true }))
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0712345678', 'a'.repeat(200))
  assert.equal(result.ok, true)
  assert.equal(result.encoding, 'gsm7')
  assert.equal(result.segments, 2)
})

// ── Prefix policy ─────────────────────────────────────────────────────────

test('an unsupported prefix is refused with its own reason', async () => {
  stubFetch(async () => jsonResponse(200, { successful: true }))
  // A Dar landline: structurally valid, cannot receive SMS. Saying "invalid
  // number" would send someone hunting for a typo that is not there.
  const result = await new BeemSmsProvider(CFG, 'invitation').sendText('0222110000', 'Karibu')
  assert.equal(captured.length, 0)
  assert.equal(result.ok, false)
  assert.ok(result.error?.includes('prefix'))
})

// ── Provider selection ────────────────────────────────────────────────────

test('a disabled purpose gets the stub, and the stub sends nothing', async () => {
  stubFetch(async () => jsonResponse(200, { successful: true }))
  for (const purpose of SMS_PURPOSES) {
    const provider = selectSmsProvider(purpose, { enabled: false, config: CFG })
    assert.equal(provider.name, 'stub', purpose)
    assert.equal(provider.live, false, purpose)
    assert.equal(provider.purpose, purpose)

    const result = await provider.sendText('0712345678', 'Karibu')
    assert.equal(result.dryRun, true, purpose)
  }
  assert.equal(captured.length, 0)
})

test('a stub result is unmistakably a dry run, never a bare success', () => {
  // `ok: true` alone reads as "sent"; dryRun is what stops a validation pass
  // concluding an SMS went out that never did.
  const provider = selectSmsProvider('invitation', { enabled: false, config: CFG })
  return provider.sendText('0712345678', 'Karibu').then((result) => {
    assert.equal(result.ok, true)
    assert.equal(result.dryRun, true)
    assert.equal(result.provider, 'stub')
    assert.equal(result.requestId, undefined)
    assert.equal(result.httpStatus, undefined)
  })
})

test('an enabled purpose with credentials gets the live provider', () => {
  const provider = selectSmsProvider('invitation', { enabled: true, config: CFG })
  assert.equal(provider.name, 'beem')
  assert.equal(provider.live, true)
})

test('enabled but unconfigured falls back to the stub rather than failing live', () => {
  const provider = selectSmsProvider('invitation', { enabled: true, config: null })
  assert.equal(provider.name, 'stub')
  assert.equal(provider.live, false)
})
