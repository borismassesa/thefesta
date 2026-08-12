import 'server-only'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'
import { CODE_ALPHABET, CODE_LENGTH } from './checkin-code'

/**
 * Door-staff scanner access tokens + guest entry-pass signing.
 *
 * DUPLICATED from apps/opus_pass/src/lib/checkin/tokens.ts + qr.ts on
 * purpose for now (no shared package wired up yet — see the same note in
 * apps/opus_scanner/src/lib/checkin.ts and
 * apps/opus_pass/docs/checkin-scanner-plan.md). Entry-pass signing was
 * originally opus_pass-only (issued when a guest RSVPs "attending"
 * themselves), but the admin bulk-import flow needs to mint the same
 * tokens for guests it imports directly — CHECKIN_TOKEN_SECRET must match
 * across opus_pass/opus_scanner/opus_admin for a token minted here to
 * verify at the door.
 */
export interface GeneratedScannerAccessToken {
  /** Shown once to the admin, handed to the attendant — never persisted. */
  rawToken: string
  tokenHash: string
}

/**
 * Mint a door-staff code that a human can actually type.
 *
 * Deliberately short: an attendant reads this off a screen and enters it on
 * a phone at the door, so the previous 32-character base64url string was
 * hostile to use. 8 symbols over 32 is ~2^40 combinations, which alongside
 * per-event scoping and a hard expiry is far beyond feasible online guessing.
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


export function hashScannerAccessToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

function getCheckinSecret(): string {
  const secret = process.env.CHECKIN_TOKEN_SECRET
  if (!secret) throw new Error('CHECKIN_TOKEN_SECRET is not configured')
  return secret
}

export interface EntryPassPayload {
  invitationId: string
  guestContactId: string
}

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}
function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

export function signEntryPassToken(payload: EntryPassPayload): string {
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = createHmac('sha256', getCheckinSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

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

/** Admin-side tooling helper. Live guest tickets are rendered by
 * apps/opus_pass/src/lib/checkin/qr-render.ts (matrix → ECC H → protected
 * logo region → 4-module quiet zone). Keep ECC H + dark purple on white so
 * any admin preview stays in the same contrast band. */
export async function generateEntryPassQrDataUrl(guestContactId: string, invitationId: string): Promise<string> {
  const token = signEntryPassToken({ invitationId, guestContactId })
  return QRCode.toDataURL(token, { margin: 4, width: 512, errorCorrectionLevel: 'H', color: { dark: '#4A2472', light: '#FFFFFF' } })
}
