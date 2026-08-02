import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import {
  CREDENTIAL_PREFIX,
  credentialFingerprint,
  decryptCredential,
  encryptCredential,
  generateRawCredential,
  hashCredential,
  legacyCredentialsAllowed,
  loadCredentialKeyring,
  parseAdmissionCredential,
} from './credential-core'

/**
 * Unit suite for opaque admission credentials.
 *
 *   npx tsx --test src/lib/checkin/credential-core.test.ts
 *
 * The database side (issuance concurrency, rotation, resolution outcomes) is
 * covered by supabase/tests/run-admission-credentials-tests.sh.
 */

const keyEnv = (
  versions: Record<string, string>,
  current?: string
): Record<string, string | undefined> => ({
  ADMISSION_CREDENTIAL_KEYS: JSON.stringify(versions),
  ...(current ? { ADMISSION_CREDENTIAL_KEY_VERSION: current } : {}),
})

const KEY_1 = randomBytes(32).toString('base64')
const KEY_2 = randomBytes(32).toString('base64')

test('issuance produces the OP1 format', () => {
  const raw = generateRawCredential()
  assert.ok(raw.startsWith(`${CREDENTIAL_PREFIX}:`), `expected OP1 prefix, got ${raw.slice(0, 8)}`)
  const parsed = parseAdmissionCredential(raw)
  assert.equal(parsed?.kind, 'opaque_v1')
})

test('generated credential carries at least 128 bits of entropy', () => {
  const secret = generateRawCredential().slice(CREDENTIAL_PREFIX.length + 1)
  // base64url: 4 characters per 3 bytes, unpadded.
  const bytes = Math.floor((secret.length * 3) / 4)
  assert.ok(bytes >= 16, `expected >= 16 bytes of randomness, got ${bytes}`)
  assert.equal(bytes, 32, 'credential should be 256 bits')
})

test('credentials do not repeat', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 500; i += 1) seen.add(generateRawCredential())
  assert.equal(seen.size, 500)
})

test('a malformed OP1 never falls back to legacy verification', () => {
  const malformed = [
    'OP1:',
    'OP1:short',
    `OP1:${'a'.repeat(200)}`,
    'OP1:has spaces here aaaaaaaaaaaaaaaaaaaaaa',
    'OP1:invalid+chars/aaaaaaaaaaaaaaaaaaaaaaa',
    'OP1:trailing=padding=aaaaaaaaaaaaaaaaaaaa=',
  ]
  for (const value of malformed) {
    assert.equal(parseAdmissionCredential(value), null, `should reject: ${value}`)
  }
})

test('an unknown version prefix is rejected outright', () => {
  for (const value of ['OP2:aaaaaaaaaaaaaaaaaaaaaaaa', 'OP99:aaaaaaaaaaaaaaaaaaaaaaaa']) {
    assert.equal(parseAdmissionCredential(value), null, `should reject: ${value}`)
  }
})

test('prefix case variants are not normalised into a valid credential', () => {
  for (const value of ['op1:aaaaaaaaaaaaaaaaaaaaaaaa', 'Op1:aaaaaaaaaaaaaaaaaaaaaaaa']) {
    assert.equal(parseAdmissionCredential(value), null, `should reject: ${value}`)
  }
})

test('whitespace around a real credential is not repaired', () => {
  const raw = generateRawCredential()
  assert.equal(parseAdmissionCredential(` ${raw}`), null)
  assert.equal(parseAdmissionCredential(`${raw}\n`), null)
  assert.equal(parseAdmissionCredential(raw)?.kind, 'opaque_v1')
})

test('a legacy HMAC token is still classified as legacy', () => {
  // Shape only: body.signature, which the HMAC verifier then checks properly.
  const parsed = parseAdmissionCredential('eyJhIjoxfQ.c2lnbmF0dXJl')
  assert.equal(parsed?.kind, 'legacy_hmac')
})

test('a public RSVP token cannot pose as an admission credential', () => {
  // guest_contacts.public_token is 32 hex characters. It parses only as a
  // legacy candidate, where the HMAC verifier rejects it for having no
  // signature segment. It must never resolve as an opaque credential.
  const publicToken = randomBytes(16).toString('hex')
  const parsed = parseAdmissionCredential(publicToken)
  assert.equal(parsed?.kind, 'legacy_hmac')
  assert.notEqual(parsed?.kind, 'opaque_v1')
})

test('non-string input is rejected', () => {
  for (const value of [null, undefined, 42, {}, []]) {
    assert.equal(parseAdmissionCredential(value), null)
  }
})

test('hashing is stable and the hash does not contain the credential', () => {
  const raw = generateRawCredential()
  const secret = raw.slice(CREDENTIAL_PREFIX.length + 1)
  const hash = hashCredential(raw)
  assert.equal(hash, hashCredential(raw))
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.ok(!hash.includes(secret))
})

test('the fingerprint is short and non-reversible', () => {
  const raw = generateRawCredential()
  const fp = credentialFingerprint(raw)
  assert.equal(fp.length, 12)
  assert.ok(hashCredential(raw).startsWith(fp))
  assert.ok(!raw.includes(fp))
})

test('encryption round-trips through the configured key', () => {
  const keyring = loadCredentialKeyring(keyEnv({ '1': KEY_1 }))
  const raw = generateRawCredential()
  const encrypted = encryptCredential(raw, keyring)

  assert.equal(encrypted.keyVersion, 1)
  assert.ok(!encrypted.ciphertextHex.includes(Buffer.from(raw).toString('hex')))
  assert.equal(decryptCredential(encrypted.ciphertextHex, encrypted.keyVersion, keyring), raw)
})

test('the same credential encrypts differently every time', () => {
  const keyring = loadCredentialKeyring(keyEnv({ '1': KEY_1 }))
  const raw = generateRawCredential()
  const a = encryptCredential(raw, keyring)
  const b = encryptCredential(raw, keyring)
  assert.notEqual(a.ciphertextHex, b.ciphertextHex, 'nonce must not repeat')
  assert.equal(decryptCredential(a.ciphertextHex, 1, keyring), raw)
  assert.equal(decryptCredential(b.ciphertextHex, 1, keyring), raw)
})

test('a tampered ciphertext fails to decrypt rather than yielding another value', () => {
  const keyring = loadCredentialKeyring(keyEnv({ '1': KEY_1 }))
  const encrypted = encryptCredential(generateRawCredential(), keyring)

  const bytes = Buffer.from(encrypted.ciphertextHex, 'hex')
  bytes[bytes.length - 20] ^= 0xff // inside the body, before the tag
  assert.throws(() => decryptCredential(bytes.toString('hex'), 1, keyring))
})

test('the wrong key cannot decrypt', () => {
  const writer = loadCredentialKeyring(keyEnv({ '1': KEY_1 }))
  const other = loadCredentialKeyring(keyEnv({ '1': KEY_2 }))
  const encrypted = encryptCredential(generateRawCredential(), writer)
  assert.throws(() => decryptCredential(encrypted.ciphertextHex, 1, other))
})

test('an older key version stays readable after rotation', () => {
  const v1 = loadCredentialKeyring(keyEnv({ '1': KEY_1 }, '1'))
  const raw = generateRawCredential()
  const old = encryptCredential(raw, v1)

  const v2 = loadCredentialKeyring(keyEnv({ '1': KEY_1, '2': KEY_2 }, '2'))
  assert.equal(encryptCredential(raw, v2).keyVersion, 2, 'new writes use the current version')
  assert.equal(decryptCredential(old.ciphertextHex, old.keyVersion, v2), raw)
})

test('keyring configuration errors are explicit', () => {
  assert.throws(() => loadCredentialKeyring({}), /not configured/)
  assert.throws(
    () => loadCredentialKeyring({ ADMISSION_CREDENTIAL_KEYS: 'not json' }),
    /not valid JSON/
  )
  assert.throws(
    () => loadCredentialKeyring(keyEnv({ '1': Buffer.alloc(8).toString('base64') })),
    /32 bytes/
  )
  assert.throws(() => loadCredentialKeyring(keyEnv({ '1': KEY_1 }, '9')), /no matching key/)
})

test('a keyring error never quotes the key material', () => {
  try {
    loadCredentialKeyring(keyEnv({ '1': Buffer.alloc(8).toString('base64') }))
    assert.fail('should have thrown')
  } catch (err) {
    assert.ok(!(err as Error).message.includes(Buffer.alloc(8).toString('base64')))
  }
})

test('legacy tickets are accepted through the window and refused after it', () => {
  const ends = '2026-08-01T18:00:00Z'
  const event = { starts_at: '2026-08-01T10:00:00Z', ends_at: ends }

  assert.equal(legacyCredentialsAllowed(event, new Date('2026-08-01T19:00:00Z')), true)
  assert.equal(legacyCredentialsAllowed(event, new Date('2026-08-10T00:00:00Z')), true)
  assert.equal(legacyCredentialsAllowed(event, new Date('2026-09-01T00:00:00Z')), false)
})

test('an event with no end time falls back to its start plus a day', () => {
  const event = { starts_at: '2026-08-01T10:00:00Z', ends_at: null }
  assert.equal(legacyCredentialsAllowed(event, new Date('2026-08-14T00:00:00Z')), true)
  assert.equal(legacyCredentialsAllowed(event, new Date('2026-09-01T00:00:00Z')), false)
})

test('an undated event ages out on its creation date instead', () => {
  // "Date to be announced" is a normal state in this product, so an undated
  // event must not hold the legacy branch open forever — that branch is
  // retired on the evidence that nothing uses it any more.
  const event = { starts_at: null, ends_at: null, created_at: '2026-08-01T00:00:00Z' }
  assert.equal(legacyCredentialsAllowed(event, new Date('2026-09-01T00:00:00Z')), true)
  assert.equal(legacyCredentialsAllowed(event, new Date('2027-06-01T00:00:00Z')), false)
})

test('an event with nothing to anchor to at all is refused', () => {
  const event = { starts_at: null, ends_at: null }
  assert.equal(legacyCredentialsAllowed(event, new Date('2026-08-02T00:00:00Z')), false)
})
