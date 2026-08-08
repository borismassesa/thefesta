import 'server-only'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Signed tokens for the door-staff check-in scanner (apps/opus_scanner).
 *
 * Two distinct token types share the same HMAC pattern used elsewhere in
 * opus_pass (see lib/payments/selcom.ts):
 *  - Guest entry-pass token: encodes which guest_invitation a QR code admits,
 *    verified server-side on every scan — never trust the client's decode.
 *  - Scanner access token: a random bearer credential handed to a door-staff
 *    device. Only its SHA-256 hash is ever stored (scanner_access_tokens.token_hash);
 *    the raw value is shown once at generation time.
 */

function getCheckinSecret(): string {
  const secret = process.env.CHECKIN_TOKEN_SECRET
  if (!secret) throw new Error('CHECKIN_TOKEN_SECRET is not configured')
  return secret
}

export interface EntryPassPayload {
  /** guest_invitations.id — the specific (guest, event) admission this QR covers. */
  invitationId: string
  /** guest_contacts.id — included so the scanner can show the guest's name without a lookup miss. */
  guestContactId: string
}

/** Base64url encode/decode without padding, safe for embedding in a QR string. */
function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}
function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

/** Sign a guest entry-pass payload into an opaque, verifiable QR token. */
export function signEntryPassToken(payload: EntryPassPayload): string {
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = createHmac('sha256', getCheckinSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

/** Verify + decode a scanned QR token. Returns null on any tamper/format/signature failure. */
export function verifyEntryPassToken(token: string): EntryPassPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = createHmac('sha256', getCheckinSecret()).update(body).digest('base64url')

  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null

  try {
    const parsed = JSON.parse(b64urlDecode(body))
    if (typeof parsed?.invitationId !== 'string' || typeof parsed?.guestContactId !== 'string') return null
    return parsed as EntryPassPayload
  } catch {
    return null
  }
}

export interface GeneratedScannerAccessToken {
  /** Shown once to the couple/admin, handed to door staff — never persisted. */
  rawToken: string
  /** What actually gets stored in scanner_access_tokens.token_hash. */
  tokenHash: string
}

/**
 * Crockford-style base32: digits + uppercase letters, minus I, L, O and U.
 * I/L/O are dropped because they're indistinguishable from 1/1/0 when an
 * attendant is reading a code off a phone screen in a dark venue; U is
 * dropped because excluding it makes accidental profanity far less likely.
 * Exactly 32 symbols, which also makes `byte % 32` an unbiased pick.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 8

/**
 * Mint a new door-staff device credential.
 *
 * Short and typable on purpose: this gets read aloud or copied by hand at a
 * venue door, so the previous 32-character base64url string was hostile to
 * enter on a phone. 8 symbols over a 32-symbol alphabet is ~2^40
 * combinations; combined with per-event scoping and a hard expiry, that is a
 * long way beyond feasible online guessing, while staying quick to type.
 */
export function generateScannerAccessToken(): GeneratedScannerAccessToken {
  // 32 divides 256 exactly, so the modulo introduces no bias.
  const bytes = randomBytes(CODE_LENGTH)
  let rawToken = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    rawToken += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return { rawToken, tokenHash: hashScannerAccessToken(rawToken) }
}

/**
 * Fold the many ways a human might type a code into the one canonical form
 * that was hashed at generation: uppercase, no separators, and with the
 * look-alike characters folded onto the symbol actually in the alphabet.
 */
export function normalizeScannerAccessCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

/** Display form, grouped for legibility: ABCD-EFGH. */
export function formatScannerAccessCode(rawToken: string): string {
  if (rawToken.length !== CODE_LENGTH) return rawToken
  return `${rawToken.slice(0, 4)}-${rawToken.slice(4)}`
}

/** Hash a bearer token the same way at generation time and at verification time. */
export function hashScannerAccessToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Every hash a submitted code could legitimately match.
 *
 * Codes minted before the short-code format was introduced are 32-character
 * base64url strings that are case-sensitive and would be mangled by
 * normalization, so the raw input is still checked as well. Callers pass
 * this to a single `.in('token_hash', ...)` lookup rather than querying
 * twice.
 */
export function candidateScannerAccessHashes(input: string): string[] {
  const raw = input.trim()
  const normalized = normalizeScannerAccessCode(input)
  const hashes = [hashScannerAccessToken(raw)]
  if (normalized && normalized !== raw) hashes.push(hashScannerAccessToken(normalized))
  return hashes
}

/**
 * Short-lived link to a rendered check-in report.
 *
 * The mobile scanner cannot POST its way to a viewable PDF: opening a
 * document means handing a URL to the browser, and a URL is a GET. Rather
 * than putting the attendant's access token in that URL, where it would land
 * in browser history and outlive the download, the app exchanges its token
 * for one of these — scoped to a single event, valid for minutes, and good
 * for nothing but reading that one report.
 */
export interface ReportTokenPayload {
  eventId: string
  /** Unix ms. Deliberately short: this is a link that gets shared by accident. */
  expiresAt: number
}

export function signReportToken(payload: ReportTokenPayload): string {
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = createHmac('sha256', getCheckinSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

/** Verify + decode a report link token. Null on tamper, malformation or expiry. */
export function verifyReportToken(token: string): ReportTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = createHmac('sha256', getCheckinSecret()).update(body).digest('base64url')

  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null

  try {
    const parsed = JSON.parse(b64urlDecode(body))
    if (typeof parsed?.eventId !== 'string' || typeof parsed?.expiresAt !== 'number') return null
    // Expiry is checked here, not by the caller: a caller that forgets makes
    // the link permanent, which is the one property it must never have.
    if (parsed.expiresAt < Date.now()) return null
    return parsed as ReportTokenPayload
  } catch {
    return null
  }
}
