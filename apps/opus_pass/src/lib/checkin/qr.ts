import 'server-only'
import QRCode from 'qrcode'
import { signEntryPassToken } from './tokens'
import { credentialIssuanceConfigured, ensureAdmissionCredential } from './credentials'

/**
 * Deep purple on white — stays on-brand for the purple ticket artwork while
 * keeping the dark-on-light contrast scanners require (never invert it).
 */
const QR_OPTIONS = {
  margin: 1,
  width: 512,
  errorCorrectionLevel: 'M' as const,
  color: { dark: '#4A2472', light: '#FFFFFF' },
}

/** Draw an already-resolved credential. The raw value goes no further than here. */
export function renderCredentialQr(rawCredential: string): Promise<string> {
  return QRCode.toDataURL(rawCredential, QR_OPTIONS)
}

/**
 * The QR for a guest's entrance pass, as a PNG data URL.
 *
 * Draws the invitation's active opaque credential, minting one on first
 * render. Re-rendering returns the SAME credential, so a ticket already in a
 * guest's WhatsApp thread keeps working.
 *
 * ROLLOUT SAFETY VALVE: with no credential key configured this falls back to
 * the legacy signed token rather than failing the render, so a deploy that
 * lands before the key does still produces scannable tickets. That is not a
 * new exposure (legacy tokens remain valid through the compatibility window),
 * but it IS a silent downgrade to a decodable payload, so it shouts in the
 * logs. Remove this branch together with the legacy verifier.
 */
export async function generateEntryPassQrDataUrl(
  guestContactId: string,
  invitationId: string
): Promise<string> {
  if (credentialIssuanceConfigured()) {
    const credential = await ensureAdmissionCredential(invitationId, 'entrance_pass_render')
    if (credential) return renderCredentialQr(credential.rawCredential)
    console.error('[entry-pass-qr] credential issuance failed, falling back to legacy token', {
      invitationId,
    })
  } else {
    console.error(
      '[entry-pass-qr] ADMISSION_CREDENTIAL_KEYS is not configured — drawing a legacy token'
    )
  }

  return QRCode.toDataURL(signEntryPassToken({ guestContactId, invitationId }), QR_OPTIONS)
}
