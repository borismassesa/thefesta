import { createPrivateKey, createSign } from 'node:crypto'
import { type WalletPassModel, validatePassModel } from './types'

/**
 * Google Wallet save-link construction and signing.
 *
 * Free of `server-only` and of any database or network import, so the JWT this
 * produces can be verified against a public key in a unit test rather than
 * being taken on trust.
 *
 * WHY NO REST API: a save link may carry the class and object definitions
 * inline, and Google creates them when the guest taps Save. That removes the
 * OAuth token exchange, the class-management calls and every failure mode
 * between us and Google at issue time — issuing becomes a pure function of the
 * admission plus a private key. The tradeoff is that a pass cannot be *updated*
 * this way; updating requires the REST API and is Phase 2. Until then a changed
 * venue or a used admission is reflected by the door and by /p/<token>, not by
 * a live-updating pass.
 *
 * TWO CONSEQUENCES OF THAT CHOICE, both accepted deliberately:
 *
 * 1. The save URL contains the credential. The JWT's payload is base64url, not
 *    encryption, so `https://pay.google.com/gp/v/save/<jwt>` carries the OP1
 *    credential in plain sight, and browsers keep URLs in history and sync
 *    them across a signed-in profile. The REST path (pre-create the object,
 *    reference it by id) removes this entirely and is the reason to do it.
 * 2. Object ids are permanent at Google, so the id must encode the credential
 *    — see googleObjectId.
 */

const SAVE_URL_PREFIX = 'https://pay.google.com/gp/v/save/'

/** Google's own brand colour requirement is only that it be a valid hex. */
const OPUSPASS_PURPLE = '#4a2472'

export interface GoogleWalletConfig {
  issuerId: string
  serviceAccountEmail: string
  /** PEM, with real newlines. The env value's \n escapes are expanded first. */
  privateKey: string
  /** Public origin, used for the pass's "view online" link. */
  origin: string
}

/**
 * Read config from the environment, or null when this deployment has none.
 *
 * Returning null rather than throwing is deliberate: Google being unconfigured
 * is a normal state (Apple-only deployments, local development, previews), and
 * the surface should simply not offer the button.
 */
export function loadGoogleWalletConfig(
  env: Record<string, string | undefined>
): GoogleWalletConfig | null {
  // Silence is correct ONLY here: a deployment that has not turned Google on
  // is not misconfigured. Every branch below means an operator said "enabled"
  // and then got something wrong, and those must not fail silently — the
  // symptom is a button that simply never appears, with the env var they are
  // staring at reading `true`.
  if (env.GOOGLE_WALLET_ENABLED !== 'true') return null

  const issuerId = env.GOOGLE_WALLET_ISSUER_ID
  const serviceAccountEmail = env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL
  const rawKey = env.GOOGLE_WALLET_PRIVATE_KEY

  const missing = [
    ['GOOGLE_WALLET_ISSUER_ID', issuerId],
    ['GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL', serviceAccountEmail],
    ['GOOGLE_WALLET_PRIVATE_KEY', rawKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    console.error('[wallet:google] enabled but not configured, button withheld', { missing })
    return null
  }
  if (!issuerId || !serviceAccountEmail || !rawKey) return null

  // Vercel stores the key with literal \n escapes because its value box is a
  // single line. dotenv leaves them escaped too. Either way crypto needs real
  // newlines, so expand here rather than asking every operator to get the
  // encoding right by hand.
  const privateKey = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey

  // Actually parse it rather than testing for substrings. A truncated key, the
  // wrong PKCS encoding, or a value pasted with its surrounding JSON quotes
  // intact all contain "BEGIN" and "PRIVATE KEY" and all fail to sign — which
  // would render the button and then 500 for every guest who taps it. Parsing
  // here is what makes isConfigured() mean what it says.
  try {
    createPrivateKey(privateKey)
  } catch {
    // Never log the value; the failure to parse is the whole diagnosis.
    console.error(
      '[wallet:google] GOOGLE_WALLET_PRIVATE_KEY could not be parsed as a private key, button withheld'
    )
    return null
  }

  // The origins claim must match the host actually serving the page, or Google
  // rejects the save on the guest's phone while the JWT signs perfectly here.
  // A wrong host is therefore invisible to us, which is why the fallback is
  // announced rather than applied quietly.
  if (!env.NEXT_PUBLIC_OPUS_PASS_URL) {
    console.error(
      '[wallet:google] NEXT_PUBLIC_OPUS_PASS_URL is unset; falling back to the production origin. ' +
        'If this deployment serves a different host, Google will reject every save.'
    )
  }

  return {
    issuerId,
    serviceAccountEmail,
    privateKey,
    origin: (env.NEXT_PUBLIC_OPUS_PASS_URL || 'https://opuspass.opusfesta.com').replace(/\/$/, ''),
  }
}

/** Provider ids must be `<issuerId>.<suffix>` with a restricted suffix alphabet. */
function sanitiseSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_')
}

export function googleClassId(issuerId: string, eventId: string): string {
  return `${issuerId}.event_${sanitiseSuffix(eventId)}`
}

/**
 * Object ids are permanent at Google: a save link whose object already exists
 * adds THAT object and ignores the definition inline in the JWT. So the id has
 * to change whenever the pass's contents must change, and the only content
 * that matters for entry is the credential. Including it means a rotation
 * mints a fresh object the guest can save, instead of leaving them holding a
 * QR the door has already stopped accepting.
 */
export function googleObjectId(
  issuerId: string,
  invitationId: string,
  credentialId: string
): string {
  return `${issuerId}.adm_${sanitiseSuffix(invitationId)}_${sanitiseSuffix(credentialId).slice(0, 8)}`
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * The class carries everything shared by every guest at one event, and nothing
 * specific to any of them.
 */
export function buildEventTicketClass(config: GoogleWalletConfig, model: WalletPassModel) {
  return {
    id: googleClassId(config.issuerId, model.eventId),
    issuerName: 'OpusPass',
    reviewStatus: 'UNDER_REVIEW',
    eventName: { defaultValue: { language: 'en-US', value: model.eventName } },
    hexBackgroundColor: OPUSPASS_PURPLE,
    // Google requires venue name AND address together, or neither.
    ...(model.venueName && model.venueAddress
      ? {
          venue: {
            name: { defaultValue: { language: 'en-US', value: model.venueName } },
            address: { defaultValue: { language: 'en-US', value: model.venueAddress } },
          },
        }
      : {}),
    ...(model.startsAt
      ? {
          dateTime: {
            start: model.startsAt,
            ...(model.endsAt ? { end: model.endsAt } : {}),
          },
        }
      : {}),
  }
}

/**
 * The object is one guest's admission.
 *
 * `barcode.value` is the opaque OP1 credential and nothing else. Everything a
 * scanner needs it resolves server-side, so the QR carries no name, no phone,
 * no event and no invitation id — the property the whole credential design
 * exists to preserve.
 */
export function buildEventTicketObject(config: GoogleWalletConfig, model: WalletPassModel) {
  return {
    id: googleObjectId(config.issuerId, model.invitationId, model.credentialId),
    classId: googleClassId(config.issuerId, model.eventId),
    state: 'ACTIVE',
    ticketHolderName: model.guestName,
    ticketType: { defaultValue: { language: 'en-US', value: model.ticketType } },
    barcode: {
      type: 'QR_CODE',
      value: model.credential,
      // Deliberately NOT the credential: alternateText is rendered as readable
      // text under the barcode, and printing an admission credential there
      // would hand it to anyone glancing at the screen.
      alternateText: model.ticketType,
    },
    // No linksModuleData. The obvious link back is the guest's own
    // /p/<token> page, and putting that URL inside the pass would hand the
    // wallet-management capability to Google to store indefinitely. A link to
    // anything else is either a dead end or useless, so the pass carries none.
  }
}

/**
 * Sign the save JWT.
 *
 * `aud: 'google'` and `typ: 'savetowallet'` are Google's required constants;
 * `origins` scopes where the link may be invoked from.
 */
export function buildGoogleSaveJwt(
  config: GoogleWalletConfig,
  model: WalletPassModel,
  now: Date
): string {
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: config.serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(now.getTime() / 1000),
    origins: [config.origin],
    payload: {
      eventTicketClasses: [buildEventTicketClass(config, model)],
      eventTicketObjects: [buildEventTicketObject(config, model)],
    },
  }

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(config.privateKey)
  return `${signingInput}.${base64url(signature)}`
}

export interface GoogleSaveLink {
  saveUrl: string
  classId: string
  objectId: string
}

/** Build the complete save link, or throw with a reason the caller maps. */
export function buildGoogleSaveLink(
  config: GoogleWalletConfig,
  model: WalletPassModel,
  now: Date = new Date()
): GoogleSaveLink {
  const invalid = validatePassModel(model)
  if (invalid) throw new Error(`invalid_model: ${invalid}`)

  return {
    saveUrl: `${SAVE_URL_PREFIX}${buildGoogleSaveJwt(config, model, now)}`,
    classId: googleClassId(config.issuerId, model.eventId),
    objectId: googleObjectId(config.issuerId, model.invitationId, model.credentialId),
  }
}
