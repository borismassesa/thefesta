import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureWalletManagementToken, walletTokensConfigured } from '@/lib/checkin/wallet-tokens'
import { publicOrigin } from '@/lib/dashboard/share'
import { passLinkUrl } from './pass-link-core'

/**
 * The guest's own pass link.
 *
 * `/p/<token>` is where a guest sees their entry pass and saves it to a wallet.
 * The whole surface existed before this module and was unreachable: nothing
 * minted a wallet management token, so no code path could produce the URL.
 *
 * THE TOKEN IS A CAPABILITY. Anyone holding it can view the pass and mint a
 * wallet object, so it may only ever be sent to the guest it belongs to, over a
 * channel already proven to be theirs. Today that is the WhatsApp thread the
 * guest themselves just replied in. It must never go to a couple's dashboard,
 * an admin screen, a log line or an OG tag.
 */

/**
 * Mint (or re-use) the pass link for one admission.
 *
 * Returns null rather than throwing, and every null is deliberate: this is
 * always an ENHANCEMENT to a message that has to be sent anyway. A guest who
 * taps "Nitafika" must get their acknowledgement whether or not the pass
 * machinery is configured, so no failure here may take the reply down with it.
 */
export async function guestPassLink(
  invitationId: string,
  client: SupabaseClient
): Promise<string | null> {
  // Minting encrypts the token with the admission keyring, which THROWS when
  // unset rather than degrading. Checked here so an unconfigured deployment
  // simply sends the plain confirmation instead of 500ing inside a webhook
  // Meta will then retry.
  if (!walletTokensConfigured()) return null

  let token
  try {
    token = await ensureWalletManagementToken(invitationId, 'whatsapp_rsvp', client)
  } catch (err) {
    // Never the token or the invitation contents; the kind names the fault.
    console.error('[wallet] could not mint a pass link', {
      invitationId,
      kind: (err as Error)?.name,
    })
    return null
  }

  if (!token) return null
  return passLinkUrl(publicOrigin(), token.rawToken)
}
