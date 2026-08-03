import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Opaque admission credentials: format, hashing and envelope encryption.
 *
 * Deliberately free of `server-only` and of any database import so it can be
 * exercised directly by the unit suite. See lib/checkin/credentials.ts for the
 * issuance/verification flows that talk to Postgres.
 */

export const CREDENTIAL_PREFIX = 'OP1'

/**
 * 32 bytes. The credential is scanned, never typed, so there is no reason to
 * economise on length; 256 bits puts guessing out of reach permanently.
 */
const CREDENTIAL_BYTES = 32

/**
 * base64url of 16 bytes. Anything shorter than this was not produced by us,
 * and accepting it would widen the search space a guesser has to cover.
 */
const MIN_SECRET_LENGTH = 22
/** base64url of 64 bytes. Bounds the work an unauthenticated scan can cause. */
const MAX_SECRET_LENGTH = 88

/** Exactly the base64url alphabet, unpadded. */
const SECRET_PATTERN = /^[A-Za-z0-9_-]+$/

export type CredentialIssuanceSource =
  | 'entrance_pass_render'
  /** Minted (or reused) when a guest adds their pass to a wallet. */
  | 'wallet_pass'
  | 'rotation'
  | 'admin'
  | 'backfill'

/**
 * Strictly one of the two shapes a scanned string may take. Anything that is
 * neither is `null` from the parser, never coerced into one of these.
 */
export type ParsedAdmissionCredential =
  | { kind: 'opaque_v1'; raw: string; secret: string }
  | { kind: 'legacy_hmac'; raw: string }

/** Mint a fresh opaque credential. The only place raw credentials are born. */
export function generateRawCredential(): string {
  return `${CREDENTIAL_PREFIX}:${randomBytes(CREDENTIAL_BYTES).toString('base64url')}`
}

/**
 * Classify a scanned string.
 *
 * The `OP1:` branch is a cliff, not a fallback: once a string claims to be an
 * opaque credential, a malformed body is rejected outright rather than handed
 * to the legacy HMAC parser. Letting it fall through would mean an attacker
 * could pick whichever verifier they preferred by prefixing at will, which is
 * exactly the format-confusion bug this split exists to prevent.
 *
 * Returns null for anything unparseable.
 */
export function parseAdmissionCredential(input: unknown): ParsedAdmissionCredential | null {
  if (typeof input !== 'string') return null

  // No trimming, no case folding, no separator stripping. A credential is
  // machine-produced and machine-read; "helpfully" repairing one only ever
  // turns a value we did not issue into one we accept.
  const raw = input

  // Whitespace anywhere is disqualifying for BOTH formats (base64url and
  // base64url.base64url contain none). Rejecting it here rather than in the
  // OP1 branch matters: ` OP1:...` would otherwise miss the prefix test and
  // be handed to the legacy HMAC parser, which is the exact format confusion
  // the two branches are separated to prevent.
  if (/\s/.test(raw)) return null

  if (raw.startsWith(`${CREDENTIAL_PREFIX}:`)) {
    const secret = raw.slice(CREDENTIAL_PREFIX.length + 1)
    if (secret.length < MIN_SECRET_LENGTH || secret.length > MAX_SECRET_LENGTH) return null
    if (!SECRET_PATTERN.test(secret)) return null
    return { kind: 'opaque_v1', raw, secret }
  }

  // A legacy token is `base64url.base64url` and therefore contains no colon.
  // Anything that does is some OTHER namespaced OpusPass value: a future OP2,
  // a wallet management token, whatever comes next. Refusing the whole shape
  // here keeps two properties: none of them can reach the HMAC verifier, and
  // none of them can be filed in the audit as a legacy scan, which would
  // quietly inflate the number the legacy branch is retired on.
  if (raw.includes(':')) return null

  if (raw.length === 0 || raw.length > 4096) return null
  return { kind: 'legacy_hmac', raw }
}

/** SHA-256 of the raw credential, hex. The only value ever looked up. */
export function hashCredential(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/**
 * Short, non-reversible tag for correlating repeated attempts during an
 * incident. 12 hex characters is far too little to reverse and far too little
 * to confirm a guess against.
 */
export function credentialFingerprint(raw: string): string {
  return hashCredential(raw).slice(0, 12)
}

/** Constant-time compare of two hex digests, for callers matching in memory. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/* -------------------------------------------------------------------------- */
/* Envelope encryption                                                        */
/* -------------------------------------------------------------------------- */

const GCM_NONCE_BYTES = 12
const GCM_TAG_BYTES = 16
const KEY_BYTES = 32

export interface CredentialKeyring {
  /** Version used for new writes. */
  currentVersion: number
  /** Every version that can still be decrypted, so keys can be rotated. */
  keys: Map<number, Buffer>
}

/**
 * Build a keyring from environment configuration.
 *
 * ADMISSION_CREDENTIAL_KEYS is a JSON object of version to base64 32-byte key,
 * e.g. {"1":"<base64>"}. ADMISSION_CREDENTIAL_KEY_VERSION selects the one new
 * credentials are written with; older versions stay readable so a key can be
 * retired without invalidating tickets already in guests' hands.
 */
export function loadCredentialKeyring(
  env: Record<string, string | undefined> = process.env
): CredentialKeyring {
  const rawKeys = env.ADMISSION_CREDENTIAL_KEYS
  if (!rawKeys) throw new Error('ADMISSION_CREDENTIAL_KEYS is not configured')

  let parsed: unknown
  try {
    parsed = JSON.parse(rawKeys)
  } catch {
    throw new Error('ADMISSION_CREDENTIAL_KEYS is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('ADMISSION_CREDENTIAL_KEYS must be a JSON object of version to base64 key')
  }

  const keys = new Map<number, Buffer>()
  for (const [version, value] of Object.entries(parsed as Record<string, unknown>)) {
    const versionNum = Number(version)
    if (!Number.isInteger(versionNum) || versionNum < 1) {
      throw new Error(`ADMISSION_CREDENTIAL_KEYS has a non-integer version: ${version}`)
    }
    if (typeof value !== 'string') {
      throw new Error(`ADMISSION_CREDENTIAL_KEYS[${version}] must be a base64 string`)
    }
    const key = Buffer.from(value, 'base64')
    if (key.length !== KEY_BYTES) {
      throw new Error(`ADMISSION_CREDENTIAL_KEYS[${version}] must decode to ${KEY_BYTES} bytes`)
    }
    keys.set(versionNum, key)
  }
  if (keys.size === 0) throw new Error('ADMISSION_CREDENTIAL_KEYS is empty')

  const configured = env.ADMISSION_CREDENTIAL_KEY_VERSION
  const currentVersion = configured ? Number(configured) : Math.max(...keys.keys())
  if (!keys.has(currentVersion)) {
    throw new Error(`ADMISSION_CREDENTIAL_KEY_VERSION ${currentVersion} has no matching key`)
  }

  return { currentVersion, keys }
}

export interface EncryptedCredential {
  /** nonce || ciphertext || tag, hex. Stored as BYTEA. */
  ciphertextHex: string
  keyVersion: number
}

/**
 * AES-256-GCM, authenticated so a tampered ciphertext fails to decrypt rather
 * than yielding a different credential.
 */
export function encryptCredential(raw: string, keyring: CredentialKeyring): EncryptedCredential {
  const key = keyring.keys.get(keyring.currentVersion)
  if (!key) throw new Error(`No credential key for version ${keyring.currentVersion}`)

  const nonce = randomBytes(GCM_NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const body = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    ciphertextHex: Buffer.concat([nonce, body, tag]).toString('hex'),
    keyVersion: keyring.currentVersion,
  }
}

/** Reverse of encryptCredential. Throws on a wrong key or tampered payload. */
export function decryptCredential(
  ciphertextHex: string,
  keyVersion: number,
  keyring: CredentialKeyring
): string {
  const key = keyring.keys.get(keyVersion)
  if (!key) throw new Error(`No credential key for version ${keyVersion}`)

  const buf = Buffer.from(ciphertextHex, 'hex')
  if (buf.length <= GCM_NONCE_BYTES + GCM_TAG_BYTES) {
    throw new Error('Credential ciphertext is too short to be valid')
  }

  const nonce = buf.subarray(0, GCM_NONCE_BYTES)
  const tag = buf.subarray(buf.length - GCM_TAG_BYTES)
  const body = buf.subarray(GCM_NONCE_BYTES, buf.length - GCM_TAG_BYTES)

  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

/* -------------------------------------------------------------------------- */
/* Legacy retirement window                                                   */
/* -------------------------------------------------------------------------- */

/** Days after an event ends that its pre-OP1 tickets keep working. */
const DEFAULT_LEGACY_GRACE_DAYS = 14
/** Assumed length of an event with no recorded end, for the same purpose. */
const ASSUMED_EVENT_HOURS = 24
/** How long an undated event keeps honouring pre-OP1 tickets after creation. */
const ASSUMED_UNDATED_EVENT_DAYS = 180

/**
 * Whether a legacy HMAC ticket may still be honoured for this event.
 *
 * Tickets already sitting in guests' WhatsApp threads cannot be recalled, so
 * the compatibility branch has to outlive the events those tickets were sent
 * for. It must not outlive them indefinitely, which is what an unbounded
 * "accept legacy forever" would amount to, so the window is anchored to the
 * event itself and closes on its own.
 */
export function legacyCredentialsAllowed(
  event: { starts_at: string | null; ends_at: string | null; created_at?: string | null },
  now: Date = new Date(),
  graceDays: number = DEFAULT_LEGACY_GRACE_DAYS
): boolean {
  const endsAt = event.ends_at ? Date.parse(event.ends_at) : NaN
  const startsAt = event.starts_at ? Date.parse(event.starts_at) : NaN

  // "Date to be announced" is a normal state in this product, not a rare edge
  // case, so an event with no dates must NOT hold the compatibility branch
  // open forever — that is the branch's own retirement signal, and it would
  // never drain to zero. Fall back to when the event was created, which does
  // age out. With nothing at all to anchor to, refuse: a legacy ticket for an
  // event we can date in no way whatsoever is not worth keeping a decodable
  // payload alive for.
  const createdAt = event.created_at ? Date.parse(event.created_at) : NaN

  let reference: number
  if (Number.isFinite(endsAt)) {
    reference = endsAt
  } else if (Number.isFinite(startsAt)) {
    reference = startsAt + ASSUMED_EVENT_HOURS * 3600_000
  } else if (Number.isFinite(createdAt)) {
    reference = createdAt + ASSUMED_UNDATED_EVENT_DAYS * 86_400_000
  } else {
    return false
  }

  return now.getTime() <= reference + graceDays * 86_400_000
}
