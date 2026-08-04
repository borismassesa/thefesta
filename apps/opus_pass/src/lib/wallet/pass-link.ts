import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revokeWalletManagementTokens, walletTokensConfigured } from '@/lib/checkin/wallet-tokens'

/**
 * Retiring a guest's pass link.
 *
 * `/p/<token>` is where a guest sees their entry pass and saves it to a wallet.
 * Nothing in the app hands that link out any more: the RSVP confirmation used
 * to carry it and no longer does, so no code path mints a wallet management
 * token. Revocation stays, because links minted while it did are still live.
 */

/**
 * Kill the pass links for admissions a guest has just withdrawn from.
 *
 * A declined guest should not keep a working pass link, and until this was
 * wired nothing in the app called `revokeWalletManagementTokens` at all: a link
 * issued once stayed live forever, with no operational way to retire it short
 * of hand-written SQL. That matters more than the tidiness of it, because the
 * token is reused rather than rotated — a guest who attends, declines, then
 * re-attends would otherwise be handed back the SAME link, so a copy that
 * leaked in the first round survives the decline that should have ended it.
 *
 * Best-effort by construction. It runs after the RSVP is already recorded, and
 * the decline must stand whether or not the link could be retired. Revoking the
 * link is also not what stops entry: the door checks the admission credential.
 */
export async function revokeGuestPassLinks(
  invitationIds: string[],
  client: SupabaseClient
): Promise<void> {
  if (!walletTokensConfigured()) return

  for (const invitationId of invitationIds) {
    try {
      await revokeWalletManagementTokens(invitationId, 'rsvp_declined', client)
    } catch (err) {
      console.error('[wallet] could not revoke a pass link', {
        invitationId,
        kind: (err as Error)?.name,
      })
    }
  }
}
