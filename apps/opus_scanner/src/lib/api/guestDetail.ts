import { lookupAdmission } from '@/lib/api/checkin'
import type { RosterEntry } from '@/types/checkin'

/** A Pass ID is eight characters; a legacy entry code is six. */
const PASS_ID_LENGTH = 8

export interface ScannerCredentials {
  eventId: string
  accessToken: string
}

/**
 * Fill in the guest-specific detail the roster deliberately does not carry.
 *
 * /validate is a bulk read: what it returns lands on the device for every
 * attending guest and stays there for the whole shift, so it holds only what
 * the door needs to FIND someone. The phone number is personal, so it comes
 * from /lookup, one already-resolved guest at a time — which is why picking a
 * guest off the roster costs one extra request before the confirm card can
 * show a number.
 *
 * Never throws and never blocks: a guest with no Pass ID, a lookup that fails,
 * or a server that cannot be reached all return the guest untouched. The
 * number is a tie-breaker between similar names, and an admission must not
 * wait on it.
 */
export async function withGuestDetail(
  credentials: ScannerCredentials,
  guest: RosterEntry
): Promise<RosterEntry> {
  const identifier = guest.passId ?? guest.entryCode
  if (!identifier) return guest

  try {
    const found = await lookupAdmission({
      ...credentials,
      ...(identifier.length === PASS_ID_LENGTH ? { passId: identifier } : { entryCode: identifier }),
    })
    if (found.status !== 'found') return guest
    return { ...guest, phone: found.guestPhone }
  } catch {
    return guest
  }
}
