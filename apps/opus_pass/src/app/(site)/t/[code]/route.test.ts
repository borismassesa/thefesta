import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { afterEach, test } from 'node:test'
import { GET } from './route'

/**
 * The redirect resolver's contract, asserted without a dev server.
 *
 * The proof it supports is a manual one (send a WhatsApp template, tap it,
 * watch where it lands), so the parts that CAN be pinned down automatically
 * should be, or the manual run ends up re-testing basics every time it is
 * repeated.
 */

const PROOF_CODE = 'test-proof-code'

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const SAVED = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in SAVED)) delete process.env[key]
  Object.assign(process.env, SAVED)
})

function configureGoogle(): void {
  process.env.GOOGLE_WALLET_ENABLED = 'true'
  process.env.GOOGLE_WALLET_ISSUER_ID = '3388000000023183279'
  process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL = 'sa@project.iam.gserviceaccount.com'
  process.env.GOOGLE_WALLET_PRIVATE_KEY = privateKey
  process.env.NEXT_PUBLIC_OPUS_PASS_URL = 'https://opuspass.opusfesta.com'
}

function call(code: string) {
  return GET(new Request(`https://opuspass.opusfesta.com/t/${code}`), {
    params: Promise.resolve({ code }),
  })
}

test('404s when no proof is running', async () => {
  delete process.env.WALLET_REDIRECT_PROOF_CODE
  configureGoogle()
  assert.equal((await call(PROOF_CODE)).status, 404)
})

test('404s on a wrong code', async () => {
  process.env.WALLET_REDIRECT_PROOF_CODE = PROOF_CODE
  configureGoogle()
  assert.equal((await call('not-the-code')).status, 404)
})

test('a wrong code and an unset proof are indistinguishable', async () => {
  // This is a public URL. The shape of the refusal must not tell a stranger
  // whether a test is currently running.
  configureGoogle()
  delete process.env.WALLET_REDIRECT_PROOF_CODE
  const unset = await call('anything')
  process.env.WALLET_REDIRECT_PROOF_CODE = PROOF_CODE
  const wrong = await call('anything')
  assert.equal(unset.status, wrong.status)
  assert.equal(await unset.text(), await wrong.text())
})

test('redirects a correct code into Google', async () => {
  process.env.WALLET_REDIRECT_PROOF_CODE = PROOF_CODE
  configureGoogle()
  const res = await call(PROOF_CODE)
  assert.equal(res.status, 302)
  assert.ok(res.headers.get('location')?.startsWith('https://pay.google.com/gp/v/save/'))
})

test('the redirect is never cached', async () => {
  // The JWT is signed per request and the destination changes every time, so a
  // cached 302 would hand one guest another guest's link once this route stops
  // serving a single fixed test pass.
  process.env.WALLET_REDIRECT_PROOF_CODE = PROOF_CODE
  configureGoogle()
  const res = await call(PROOF_CODE)
  assert.match(res.headers.get('cache-control') ?? '', /no-store/)
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
})

test('503s when the code is right but Google is unconfigured', async () => {
  // Distinct from the 404 on purpose: whoever holds the proof code is an
  // operator, and "your config is wrong" is the answer they need.
  process.env.WALLET_REDIRECT_PROOF_CODE = PROOF_CODE
  process.env.GOOGLE_WALLET_ENABLED = 'false'
  assert.equal((await call(PROOF_CODE)).status, 503)
})
