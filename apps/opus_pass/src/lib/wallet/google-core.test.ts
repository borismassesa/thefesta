import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import test from 'node:test'
import {
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
    payload: { eventTicketObjects: { barcode: { value: string } }[] }
  }
  decoded.payload.eventTicketObjects[0].barcode.value = 'OP1:someone-elses-credential'
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
  const { saveUrl } = buildGoogleSaveLink(CONFIG, { ...MODEL, venueAddress: null })
  const claims = decodeSegment(jwtFrom(saveUrl).split('.')[1]) as {
    payload: { eventTicketClasses: Record<string, unknown>[] }
  }
  // Google rejects a partial venue outright, so omitting it is the only
  // correct move when half of it is missing.
  assert.equal('venue' in claims.payload.eventTicketClasses[0], false)
})

test('an undated event omits dateTime rather than inventing one', () => {
  const { saveUrl } = buildGoogleSaveLink(CONFIG, { ...MODEL, startsAt: null })
  const claims = decodeSegment(jwtFrom(saveUrl).split('.')[1]) as {
    payload: { eventTicketClasses: Record<string, unknown>[] }
  }
  assert.equal('dateTime' in claims.payload.eventTicketClasses[0], false)
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
  const { saveUrl } = buildGoogleSaveLink(CONFIG, MODEL)
  const claims = decodeSegment(jwtFrom(saveUrl).split('.')[1]) as {
    payload: { eventTicketClasses: { logo?: { sourceUri?: { uri?: string } }; hexBackgroundColor?: string }[] }
  }
  const klass = claims.payload.eventTicketClasses[0]

  assert.equal(klass.logo?.sourceUri?.uri, 'https://opuspass.opusfesta.com/icon-512.png')
  assert.match(klass.hexBackgroundColor ?? '', /^#[0-9a-f]{6}$/)
})

test('the class Google needs to accept an inline definition is present', () => {
  // Without reviewStatus a non-test issuer rejects the inline class, and every
  // pass breaks for every real guest while the rest of this suite still passes.
  const { saveUrl } = buildGoogleSaveLink(CONFIG, MODEL)
  const claims = decodeSegment(jwtFrom(saveUrl).split('.')[1]) as {
    payload: { eventTicketClasses: { reviewStatus?: string; issuerName?: string }[] }
  }
  assert.equal(claims.payload.eventTicketClasses[0].reviewStatus, 'UNDER_REVIEW')
  assert.equal(claims.payload.eventTicketClasses[0].issuerName, 'OpusPass')
})

test('the credential appears once in the whole JWT, and never on the class', () => {
  // The class is shared by every guest at the event. A credential landing
  // there would ship one guest's admission to all of them.
  const { saveUrl } = buildGoogleSaveLink(CONFIG, MODEL)
  const claims = decodeSegment(jwtFrom(saveUrl).split('.')[1]) as {
    payload: { eventTicketClasses: unknown[]; eventTicketObjects: unknown[] }
  }
  assert.equal(JSON.stringify(claims.payload.eventTicketClasses).includes(MODEL.credential), false)

  const whole = JSON.stringify(claims)
  assert.equal(whole.split(MODEL.credential).length - 1, 1, 'credential appears more than once')
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
