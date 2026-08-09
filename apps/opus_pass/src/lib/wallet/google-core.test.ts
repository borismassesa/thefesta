import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import test from 'node:test'
import {
  buildEventTicketClass,
  buildEventTicketObject,
  buildGoogleSaveLink,
  googleClassId,
  googleObjectId,
  loadGoogleWalletConfig,
} from './google-core'
import { validatePassModel, type WalletPassModel } from './types'

/**
 * Unit suite for the Google Wallet save link.
 *
 *   npx tsx --test src/lib/wallet/google-core.test.ts
 *
 * The signature is verified against a real public key rather than asserting on
 * the JWT's shape, because a link that merely looks well-formed and fails at
 * Google's end is exactly the failure this suite exists to prevent.
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
  // 4 + 43 characters, exactly what generateRawCredential() produces: base64url
  // of 32 bytes. A shorter stand-in would understate the save URL's length.
  credential: `OP1:${'Vnb7K0m3Yw9lN6AzR8FzJ4Gq1pE'}${'abcdefghijklmnop'}`,
  credentialId: '11111111-2222-3333-4444-555555555555',
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

function jwtFrom(saveUrl: string): string {
  assert.ok(saveUrl.startsWith('https://pay.google.com/gp/v/save/'), 'unexpected save URL prefix')
  return saveUrl.slice('https://pay.google.com/gp/v/save/'.length)
}

test('the save link carries a signature Google can actually verify', () => {
  const { saveUrl } = buildGoogleSaveLink(CONFIG, MODEL, new Date('2026-08-03T10:00:00Z'))
  const [header, payload, signature] = jwtFrom(saveUrl).split('.')

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${header}.${payload}`)
  assert.equal(
    verifier.verify(publicKey, Buffer.from(signature, 'base64url')),
    true,
    'signature does not verify against the matching public key'
  )
})

test('a tampered payload breaks the signature', () => {
  const { saveUrl } = buildGoogleSaveLink(CONFIG, MODEL)
  const [header, payload, signature] = jwtFrom(saveUrl).split('.')

  const decoded = decodeSegment(payload) as {
    payload: { eventTicketObjects: { id: string }[] }
  }
  // Repointing the reference IS the forgery now: the link is an instruction to
  // add an object id, so aiming it at another guest's object is the whole
  // attack. The signature is the only thing standing in the way.
  decoded.payload.eventTicketObjects[0].id = `${CONFIG.issuerId}.adm_someone_else`
  const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url')

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${header}.${forged}`)
  assert.equal(verifier.verify(publicKey, Buffer.from(signature, 'base64url')), false)
})

test('the JWT carries the constants Google requires', () => {
  const { saveUrl } = buildGoogleSaveLink(CONFIG, MODEL, new Date('2026-08-03T10:00:00Z'))
  const [header, payload] = jwtFrom(saveUrl).split('.')

  assert.deepEqual(decodeSegment(header), { alg: 'RS256', typ: 'JWT' })

  const claims = decodeSegment(payload) as Record<string, unknown>
  assert.equal(claims.aud, 'google')
  assert.equal(claims.typ, 'savetowallet')
  assert.equal(claims.iss, CONFIG.serviceAccountEmail)
  assert.deepEqual(claims.origins, ['https://opuspass.opusfesta.com'])
  assert.equal(claims.iat, Math.floor(Date.parse('2026-08-03T10:00:00Z') / 1000))
})

test('the barcode carries the credential and nothing else', () => {
  const object = buildEventTicketObject(CONFIG, MODEL)

  assert.equal(object.barcode.type, 'QR_CODE')
  assert.equal(object.barcode.value, MODEL.credential)

  // alternateText is rendered as readable text under the barcode. Printing the
  // credential there would show it to anyone glancing at the screen.
  assert.notEqual(object.barcode.alternateText, MODEL.credential)
  assert.ok(!object.barcode.alternateText.includes('OP1:'))
})

test('no personal data leaks into the barcode', () => {
  const serialised = JSON.stringify(buildEventTicketObject(CONFIG, MODEL).barcode)
  for (const secret of [MODEL.invitationId, MODEL.eventId, MODEL.guestName]) {
    assert.ok(!serialised.includes(secret), `barcode leaked ${secret}`)
  }
})

test('provider ids are derived and namespaced by issuer', () => {
  assert.equal(
    googleClassId(CONFIG.issuerId, MODEL.eventId),
    '3388000000023183279.event_22222222-2222-2222-2222-222222222222'
  )
  assert.equal(
    googleObjectId(CONFIG.issuerId, MODEL.invitationId, MODEL.credentialId),
    '3388000000023183279.adm_44444444-0000-0000-0000-000000000001_11111111'
  )
})

test('identifiers with characters Google rejects are sanitised', () => {
  assert.equal(googleClassId('123', 'ev/../other'), '123.event_ev____other')
})

test('two guests at one event share a class but never an object', () => {
  const other: WalletPassModel = { ...MODEL, invitationId: '44444444-0000-0000-0000-000000000002' }
  assert.equal(
    googleClassId(CONFIG.issuerId, MODEL.eventId),
    googleClassId(CONFIG.issuerId, other.eventId)
  )
  assert.notEqual(
    googleObjectId(CONFIG.issuerId, MODEL.invitationId, MODEL.credentialId),
    googleObjectId(CONFIG.issuerId, other.invitationId, other.credentialId)
  )
})

test('a venue is emitted only when both name and address exist', () => {
  // Asserted on the builder rather than the JWT: the class no longer travels in
  // the link, it is PUT to Google, so the builder's output is what Google
  // actually receives.
  const klass = buildEventTicketClass(CONFIG, { ...MODEL, venueAddress: null }) as Record<
    string,
    unknown
  >
  // Google rejects a partial venue outright, so omitting it is the only
  // correct move when half of it is missing.
  assert.equal('venue' in klass, false)
})

test('an undated event omits dateTime rather than inventing one', () => {
  const klass = buildEventTicketClass(CONFIG, { ...MODEL, startsAt: null }) as Record<
    string,
    unknown
  >
  assert.equal('dateTime' in klass, false)
})

test('a rotated credential produces a new object the guest can save', () => {
  // Object ids are permanent at Google: a save link for an id that already
  // exists adds THAT object and ignores the inline definition. If the id did
  // not move with the credential, a rotation would leave the guest holding a
  // QR the door has stopped accepting, unrepairable by re-saving.
  const rotated: WalletPassModel = {
    ...MODEL,
    credential: `OP1:${'Zz9'.padEnd(43, 'x')}`,
    credentialId: '99999999-8888-7777-6666-555555555555',
  }
  assert.notEqual(
    googleObjectId(CONFIG.issuerId, MODEL.invitationId, MODEL.credentialId),
    googleObjectId(CONFIG.issuerId, rotated.invitationId, rotated.credentialId)
  )
})

test('every pass carries branding', () => {
  // A class with no logo is rejected by Google, and a pass that renders
  // unbranded is worse than one that fails loudly.
  const klass = buildEventTicketClass(CONFIG, MODEL) as {
    logo?: { sourceUri?: { uri?: string } }
    hexBackgroundColor?: string
  }

  assert.equal(klass.logo?.sourceUri?.uri, 'https://opuspass.opusfesta.com/icon-512.png')
  assert.match(klass.hexBackgroundColor ?? '', /^#[0-9a-f]{6}$/)
})

test('the class carries what Google needs to accept it', () => {
  // Without reviewStatus a non-test issuer rejects the class, and every pass
  // breaks for every real guest while the rest of this suite still passes.
  const klass = buildEventTicketClass(CONFIG, MODEL) as {
    reviewStatus?: string
    issuerName?: string
  }
  assert.equal(klass.reviewStatus, 'UNDER_REVIEW')
  assert.equal(klass.issuerName, 'OpusPass')
})

test('the credential never enters the save link at all', () => {
  // The reason the inline payload was abandoned. A JWT is base64url, not
  // encryption, so anything in the payload is in the URL — and browsers keep
  // URLs in history and sync them across a signed-in profile. Under the REST
  // path the credential reaches Google in a request body and the link carries
  // only an object id.
  const { saveUrl } = buildGoogleSaveLink(CONFIG, MODEL)
  assert.equal(saveUrl.includes(MODEL.credential), false)

  const claims = decodeSegment(jwtFrom(saveUrl).split('.')[1])
  assert.equal(JSON.stringify(claims).includes(MODEL.credential), false)
})

test('the credential rides on the object and never on the shared class', () => {
  // The class is shared by every guest at the event. A credential landing
  // there would ship one guest's admission to all of them.
  const klass = JSON.stringify(buildEventTicketClass(CONFIG, MODEL))
  assert.equal(klass.includes(MODEL.credential), false)

  const object = JSON.stringify(buildEventTicketObject(CONFIG, MODEL))
  assert.equal(
    object.split(MODEL.credential).length - 1,
    1,
    'credential should appear exactly once on the object'
  )
})

test('the save link stays far inside the length Google will accept', () => {
  // The defect that forced the REST path: the inline payload put every field of
  // the pass into the URL, and a realistic one measured 2,111 characters
  // against Google's ~1,800 guidance. A reference is flat in the pass's size,
  // so the WORST case here is a fully-populated event.
  const { saveUrl } = buildGoogleSaveLink(CONFIG, {
    ...MODEL,
    venueName: 'Mlimani City Conference Centre',
    venueAddress: 'Sam Nujoma Road, Dar es Salaam, Tanzania',
    startsAt: '2026-12-19T15:00:00Z',
    endsAt: '2026-12-19T23:00:00Z',
    ticketType: 'Admits 4',
    entryAllowance: 4,
  })
  assert.ok(saveUrl.length < 1800, `save URL is ${saveUrl.length} characters`)

  // And adding pass content must not move it, which is the property that makes
  // the limit safe to stop thinking about.
  const minimal = buildGoogleSaveLink(CONFIG, {
    ...MODEL,
    venueName: null,
    venueAddress: null,
    startsAt: null,
    endsAt: null,
  })
  assert.equal(saveUrl.length, minimal.saveUrl.length)
})

test('the pass carries no link back, so no capability is stored at Google', () => {
  // The only useful link would be the guest's own /p/<token> page, and putting
  // it in the pass hands that capability to Google to keep indefinitely.
  const object = buildEventTicketObject(CONFIG, MODEL) as Record<string, unknown>
  assert.equal('linksModuleData' in object, false)
})

test('a pass without a real admission credential is refused', () => {
  for (const credential of [
    '',
    'not-a-credential',
    'eyJhIjoxfQ.c2ln',
    // These pass a naive prefix test and are refused by the door as malformed,
    // which is the exact "valid in a wallet, fails at the gate" case.
    'OP1:',
    'OP1:short',
    'OP1:has+invalid/chars+aaaaaaaaaaaaaaaaaaaa',
  ]) {
    assert.throws(
      () => buildGoogleSaveLink(CONFIG, { ...MODEL, credential }),
      /invalid_model/,
      `should refuse: ${credential}`
    )
  }
})

test('validation rejects models that would produce a misleading pass', () => {
  assert.match(validatePassModel({ ...MODEL, guestName: '  ' })!, /guest name/)
  assert.match(validatePassModel({ ...MODEL, eventName: '' })!, /event name/)
  assert.match(validatePassModel({ ...MODEL, entryAllowance: 0 })!, /allowance/)
  assert.match(validatePassModel({ ...MODEL, entryAllowance: 1.5 })!, /allowance/)
  assert.match(validatePassModel({ ...MODEL, invitationId: '' })!, /identifiers/)
  assert.match(validatePassModel({ ...MODEL, credentialId: '' })!, /identifiers/)
  assert.equal(validatePassModel(MODEL), null)
})

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const ENV_BASE = {
  GOOGLE_WALLET_ENABLED: 'true',
  GOOGLE_WALLET_ISSUER_ID: '3388000000023183279',
  GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: 'sa@project.iam.gserviceaccount.com',
  GOOGLE_WALLET_PRIVATE_KEY: privateKey,
}

test('the flag alone decides whether Google is offered', () => {
  assert.equal(loadGoogleWalletConfig({ ...ENV_BASE, GOOGLE_WALLET_ENABLED: 'false' }), null)
  assert.equal(loadGoogleWalletConfig({ ...ENV_BASE, GOOGLE_WALLET_ENABLED: undefined }), null)
  assert.notEqual(loadGoogleWalletConfig(ENV_BASE), null)
})

test('incomplete credentials read as unconfigured rather than throwing', () => {
  // A half-configured deployment must simply not offer the button. Throwing
  // here would take down the whole pass page.
  assert.equal(loadGoogleWalletConfig({ ...ENV_BASE, GOOGLE_WALLET_ISSUER_ID: undefined }), null)
  assert.equal(loadGoogleWalletConfig({ ...ENV_BASE, GOOGLE_WALLET_PRIVATE_KEY: undefined }), null)
  assert.equal(loadGoogleWalletConfig({ ...ENV_BASE, GOOGLE_WALLET_PRIVATE_KEY: 'nonsense' }), null)
})

test('a localhost app origin does not become the logo Google fetches', () => {
  // The failure this guard exists for, reproduced. Google retrieves the class
  // logo from its own servers, so a developer's localhost URL produced
  // `class_http_400` on every class create, with nothing in the code naming
  // the cause.
  assert.equal(
    loadGoogleWalletConfig({ ...ENV_BASE, NEXT_PUBLIC_OPUS_PASS_URL: 'http://localhost:3008' }),
    null
  )
  assert.equal(
    loadGoogleWalletConfig({ ...ENV_BASE, GOOGLE_WALLET_ASSET_BASE_URL: 'http://example.com' }),
    null
  )
})

test('the asset origin and the app origin are separate concepts', () => {
  // Local development is the case that needs both at once: the app genuinely
  // runs on localhost while Google still has to fetch a real logo.
  const config = loadGoogleWalletConfig({
    ...ENV_BASE,
    NEXT_PUBLIC_OPUS_PASS_URL: 'http://localhost:3008',
    GOOGLE_WALLET_ASSET_BASE_URL: 'https://opuspass.opusfesta.com/',
  })

  assert.notEqual(config, null)
  assert.equal(config!.origin, 'http://localhost:3008')
  // Trailing slash stripped, or the logo URI doubles it.
  assert.equal(config!.assetOrigin, 'https://opuspass.opusfesta.com')

  const klass = buildEventTicketClass(config!, MODEL) as { logo?: { sourceUri?: { uri?: string } } }
  assert.equal(klass.logo?.sourceUri?.uri, 'https://opuspass.opusfesta.com/icon-512.png')

  // The origins claim still follows the APP, which is what it describes.
  const claims = JSON.parse(
    Buffer.from(jwtFrom(buildGoogleSaveLink(config!, MODEL).saveUrl).split('.')[1], 'base64url').toString()
  ) as { origins: string[] }
  assert.deepEqual(claims.origins, ['http://localhost:3008'])
})

test('a key stored with escaped newlines is expanded before use', () => {
  // Vercel's value box is a single line, so the key arrives with literal \n.
  // Signing with it unexpanded fails, which is the most common wallet
  // misconfiguration there is.
  const escaped = privateKey.replace(/\n/g, '\\n')
  const config = loadGoogleWalletConfig({ ...ENV_BASE, GOOGLE_WALLET_PRIVATE_KEY: escaped })

  assert.notEqual(config, null)
  assert.ok(config!.privateKey.includes('\n'))
  assert.ok(!config!.privateKey.includes('\\n'))

  const { saveUrl } = buildGoogleSaveLink(config!, MODEL)
  const [header, payload, signature] = jwtFrom(saveUrl).split('.')
  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${header}.${payload}`)
  assert.equal(verifier.verify(publicKey, Buffer.from(signature, 'base64url')), true)
})

test('a key already containing real newlines is left alone', () => {
  const config = loadGoogleWalletConfig(ENV_BASE)
  assert.equal(config!.privateKey, privateKey)
})

test('the Pass ID is printed under the barcode, grouped for reading aloud', () => {
  // alternateText is the one readable line under the QR. A credential must
  // never go there; a Pass ID is an identifier and is exactly what a guest
  // whose screen will not scan needs to read out.
  const object = buildEventTicketObject(CONFIG, { ...MODEL, passId: '9KYSZTNF' })
  assert.equal(object.barcode.alternateText, '9KYS ZTNF')
  assert.equal(object.barcode.value, MODEL.credential, 'the barcode itself is unchanged')
  assert.notEqual(object.barcode.alternateText, MODEL.credential)
})

test('a pass issued before Pass IDs existed still renders', () => {
  const object = buildEventTicketObject(CONFIG, { ...MODEL, passId: null })
  assert.equal(object.barcode.alternateText, MODEL.ticketType)
})
