/**
 * The reply a guest gets after tapping an RSVP button.
 *
 * Acknowledgement only. It carried the guest's `/p/<token>` entry-pass link for
 * a while; that was removed, so nothing in the RSVP flow hands out a wallet
 * capability over WhatsApp any more.
 */
export function rsvpConfirmationMessage(status: string): string {
  if (status !== 'attending') {
    return 'Asante kwa kutujulisha. Tunasikitika kwamba hutoweza kuhudhuria. 💐'
  }
  return 'Asante! Tumepokea uthibitisho wako wa kuhudhuria. Tunakusubiri! 🎉'
}
