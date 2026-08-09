import { createPrivateKey, createSign } from 'node:crypto'
import { type WalletPassModel, validatePassModel } from './types'

/**
 * Google Wallet save-link construction and signing.
 *
 * Free of `server-only` and of any database or network import, so the JWT this
 * produces can be verified against a public key in a unit test rather than
 * being taken on trust.
 *
 * The class and object are built here and SENT over the REST API (google-rest.ts);
 * the save link then references the object by id. An earlier version defined
 * both inline inside the save JWT, which needed no OAuth and no API calls, but
 * had to be abandoned: the JWT is base64url, so a realistic pass reached 2,111
 * characters against Google's ~1,800 guidance, and the OP1 credential travelled
 * in the URL in plain sight. buildGoogleSaveJwt carries the full reasoning.
 *
 * Object ids are permanent at Google, so the id must encode the credential —
 * see googleObjectId.
 */

const SAVE_URL_PREFIX = 'https://pay.google.com/gp/v/save/'

/**
 * The card colour. Pale on purpose: Google derives its text colour from this
 * value's luminance, and a light card gives dark text, which is what a steward
 * is squinting at in poor light at a gate.
 *
 * Oyster. Chosen over ivory and cream because both sit close enough to white
 * to read as unfinished on a bright screen, while oyster has enough body to
 * look deliberate.
 *
 * Alternatives already considered: #F9F5EC ivory, #F2EADA cream, #F2C230 gold,
 * #2A1240 midnight plum. Any dark card needs a pale mark instead of the
 * current purple one.
 *
 * This will become a per-event value: the pass should match each wedding's
 * palette rather than OpusPass's, so a garden ceremony and a black-tie
 * reception do not get the same card. Reading it from the event is a later
 * PR; the constant is the default.
 */
const PASS_BACKGROUND = '#e4ded0'

/**
 * The OpusPass mark, transparent PNG, so it sits directly on the card colour
 * with no white plate behind it. Deliberately the mark alone: Google renders
 * this at roughly 18px, where the wordmark and tagline are illegible.
 *
 * No hero image. The strip renders about 40px tall, which holds one bold shape
 * or nothing, and nothing beats a shape chosen only to fill the slot.
 */
const LOGO_PATH = '/icon-512.png'

export interface GoogleWalletConfig {
  issuerId: string
  serviceAccountEmail: string
  /** PEM, with real newlines. The env value's \n escapes are expanded first. */
  privateKey: string
  /**
   * Where the app is served. Goes in the JWT's `origins` claim, which is about
   * where a save may be invoked FROM.
   *
   * Legitimately `http://localhost:3008` in development.
   */
  origin: string
  /**
   * Where GOOGLE fetches pass assets from. A different concept from `origin`,
   * and the reason they are separate fields.
   *
   * The class embeds a logo by URL and Google's servers retrieve it, so this
   * one must be publicly reachable HTTPS no matter what machine is running the
   * code. Deriving it from the app origin meant a developer's localhost URL
   * went to Google as the logo, and every class create came back
   * `class_http_400` with nothing in the error naming the cause.
   */
  assetOrigin: string
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

  const origin = (env.NEXT_PUBLIC_OPUS_PASS_URL || 'https://opuspass.opusfesta.com').replace(/\/$/, '')

  // Falls back to the app origin so no existing deployment needs a new variable
  // to keep working, and every production origin is already HTTPS. The point of
  // the separate variable is the case the fallback cannot serve: a developer on
  // localhost who needs Google to reach a real logo.
  const assetOrigin = (
    env.GOOGLE_WALLET_ASSET_BASE_URL ||
    env.NEXT_PUBLIC_OPUS_PASS_URL ||
    'https://opuspass.opusfesta.com'
  ).replace(/\/$/, '')

  // Fail HERE rather than at Google. This exact misconfiguration cost a
  // debugging session: the class create returned `class_http_400`, which is
  // indistinguishable from a genuinely malformed pass, and the adapter cannot
  // quote Google's explanation because its error payloads echo the request and
  // the request carries the admission credential. Refusing up front is the only
  // place the real cause can be stated.
  if (!assetOrigin.startsWith('https://')) {
    console.error(
      '[wallet:google] GOOGLE_WALLET_ASSET_BASE_URL must be public HTTPS, button withheld. ' +
        `Google fetches the pass logo from ${assetOrigin}/${LOGO_PATH.replace(/^\//, '')} and cannot reach it. ` +
        'Set GOOGLE_WALLET_ASSET_BASE_URL="https://opuspass.opusfesta.com" to provision from a local machine.'
    )
    return null
  }

  return {
    issuerId,
    serviceAccountEmail,
    privateKey,
    origin,
    assetOrigin,
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

export function base64url(input: Buffer | string): string {
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
    hexBackgroundColor: PASS_BACKGROUND,
    logo: {
      // assetOrigin, never origin: Google's servers fetch this, so a localhost
      // app origin here is a class Google rejects. See GoogleWalletConfig.
      sourceUri: { uri: `${config.assetOrigin}${LOGO_PATH}` },
      contentDescription: { defaultValue: { language: 'en-US', value: 'OpusPass' } },
    },
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
      //
      // The Pass ID is exactly what belongs here instead. It is an identifier,
      // not a credential — presenting one still goes through every check a
      // scan does — so it is safe to display, and it is the value a guest
      // whose screen will not scan needs to read aloud. Grouped 4-and-4 to
      // match the ticket. Falls back to the ticket type for passes issued
      // before Pass IDs existed.
      alternateText: model.passId
        ? `${model.passId.slice(0, 4)} ${model.passId.slice(4)}`
        : model.ticketType,
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
 *
 * The payload REFERENCES an object by id rather than defining it inline. The
 * object and its class are created first over the REST API (see google-rest.ts)
 * and this link only says "add that one". Two reasons it works this way, both
 * learned from the inline version:
 *
 *   LENGTH — a JWT is base64url, so an inline definition puts every field of
 *   the pass into the URL. A realistic pass measured 2,111 characters against
 *   Google's ~1,800 guidance; only one with no venue and no date fitted. A
 *   reference is a few dozen bytes no matter how much the pass says.
 *
 *   EXPOSURE — an inline definition carried the OP1 credential in the URL in
 *   plain sight, and browsers keep URLs in history and sync them across a
 *   signed-in profile. Here the credential reaches Google in a request body
 *   over TLS and never enters the link at all.
 */
export function buildGoogleSaveJwt(
  config: GoogleWalletConfig,
  objectId: string,
  now: Date
): string {
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: config.serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(now.getTime() / 1000),
    origins: [config.origin],
    payload: { eventTicketObjects: [{ id: objectId }] },
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

/**
 * Build the save link for an object that has ALREADY been provisioned.
 *
 * Still validates the model even though the credential no longer travels in the
 * link: the object id is derived from the model, and a model bad enough to be
 * refused here would have produced a pass that looks valid in a wallet and
 * fails at the door. That check is the reason this function exists rather than
 * the id being formatted at the call site.
 */
export function buildGoogleSaveLink(
  config: GoogleWalletConfig,
  model: WalletPassModel,
  now: Date = new Date()
): GoogleSaveLink {
  const invalid = validatePassModel(model)
  if (invalid) throw new Error(`invalid_model: ${invalid}`)

  const objectId = googleObjectId(config.issuerId, model.invitationId, model.credentialId)

  return {
    saveUrl: `${SAVE_URL_PREFIX}${buildGoogleSaveJwt(config, objectId, now)}`,
    classId: googleClassId(config.issuerId, model.eventId),
    objectId,
  }
}
