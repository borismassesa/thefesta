import 'server-only'
import {
  buildGoogleSaveLink,
  type GoogleWalletConfig,
  loadGoogleWalletConfig,
} from './google-core'
import { credentialIssuanceConfigured } from '@/lib/checkin/credentials'
import type { WalletIssueResult, WalletPassModel, WalletProvider, WalletProviderId } from './types'

/**
 * The provider registry.
 *
 * Each adapter is behind its own flag and reports whether it is configured, so
 * a deployment with only one set of credentials offers only that button rather
 * than failing when the guest taps the other.
 */

let cachedGoogleConfig: GoogleWalletConfig | null | undefined

function googleConfig(): GoogleWalletConfig | null {
  if (cachedGoogleConfig === undefined) cachedGoogleConfig = loadGoogleWalletConfig(process.env)
  return cachedGoogleConfig
}

const googleProvider: WalletProvider = {
  id: 'google',
  isConfigured: () => googleConfig() !== null,
  async issue(model: WalletPassModel): Promise<WalletIssueResult> {
    const config = googleConfig()
    if (!config) return { ok: false, reason: 'not_configured' }

    try {
      const link = buildGoogleSaveLink(config, model)
      return { ok: true, saveUrl: link.saveUrl, classId: link.classId, objectId: link.objectId }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      if (message.startsWith('invalid_model')) {
        // Safe to log: validatePassModel never quotes the credential.
        console.error('[wallet:google] refused to issue an invalid pass', {
          invitationId: model.invitationId,
          message,
        })
        return { ok: false, reason: 'invalid_model' }
      }
      // Signing failures almost always mean a malformed private key. The
      // message can echo key material, so it is not logged; OpenSSL's code,
      // library and reason cannot and are exactly what names the fault.
      const e = err as NodeJS.ErrnoException & { library?: string; reason?: string }
      console.error('[wallet:google] signing failed, check GOOGLE_WALLET_PRIVATE_KEY', {
        invitationId: model.invitationId,
        kind: e?.name,
        code: e?.code,
        library: e?.library,
        reason: e?.reason,
      })
      return { ok: false, reason: 'provider_error', code: 'sign_failed' }
    }
  },
}

/**
 * Apple is deliberately a stub in this PR.
 *
 * A .pkpass has to be signed with a Pass Type ID certificate that does not
 * exist yet, and inventing a half-implementation now would mean writing the
 * signing path with nothing to verify it against. It reports itself
 * unconfigured, so the surface simply does not offer the button.
 */
const appleProvider: WalletProvider = {
  id: 'apple',
  isConfigured: () => false,
  async issue(): Promise<WalletIssueResult> {
    return { ok: false, reason: 'not_configured' }
  },
}

const PROVIDERS: Record<WalletProviderId, WalletProvider> = {
  google: googleProvider,
  apple: appleProvider,
}

export function walletProvider(id: WalletProviderId): WalletProvider {
  return PROVIDERS[id]
}

/** Which buttons the pass surface should offer. Presentation only. */
export function configuredProviders(): WalletProviderId[] {
  return (Object.keys(PROVIDERS) as WalletProviderId[]).filter((id) =>
    PROVIDERS[id].isConfigured()
  )
}

/**
 * Whether a pass can actually be issued, not merely whether a provider has
 * credentials.
 *
 * Issuance also needs the admission keyring and the wallet-token keyring, and
 * those throw rather than degrade. Without this check a deployment with Google
 * configured but no ADMISSION_CREDENTIAL_KEYS shows the button to every guest
 * and 500s on every tap.
 */
export function walletIssuanceReady(): boolean {
  return credentialIssuanceConfigured() && configuredProviders().length > 0
}

/** Test seam: clears the memoised config so env changes are picked up. */
export function resetWalletProviderCache(): void {
  cachedGoogleConfig = undefined
}
