import 'server-only'
import { signEntryPassToken } from './tokens'
import { credentialIssuanceConfigured, ensureAdmissionCredential } from './credentials'
import { renderEntryPassQr } from './qr-render'

/**
 * Draw an already-resolved admission credential as the branded entrance-pass
 * QR. The raw value goes no further than here — never a Pass ID or other
 * display identifier.
 */
export async function renderCredentialQr(rawCredential: string): Promise<string> {
  const { dataUrl } = await renderEntryPassQr(rawCredential)
  return dataUrl
}

/**
 * The QR for a guest's entrance pass, as a PNG data URL.
 *
 * Draws the invitation's active opaque credential, minting one on first
 * render. Re-rendering returns the SAME credential, so a ticket already in a
 * guest's WhatsApp thread keeps working.
 *
 * Returns null when the pass has been WITHDRAWN. That case must never fall
 * back to anything: drawing a legacy token for a revoked credential would put
 * a working QR back in the guest's hands and undo the revocation.
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
): Promise<string | null> {
  if (credentialIssuanceConfigured()) {
    const outcome = await ensureAdmissionCredential(invitationId, 'entrance_pass_render')
    if (outcome.status === 'ok') return renderCredentialQr(outcome.credential.rawCredential)
    if (outcome.status === 'revoked') {
      console.warn('[entry-pass-qr] pass is revoked, refusing to draw a ticket', { invitationId })
      return null
    }
    console.error('[entry-pass-qr] credential issuance failed, falling back to legacy token', {
      invitationId,
    })
  } else {
    console.error(
      '[entry-pass-qr] ADMISSION_CREDENTIAL_KEYS is not configured — drawing a legacy token'
    )
  }

  return renderCredentialQr(signEntryPassToken({ guestContactId, invitationId }))
}
