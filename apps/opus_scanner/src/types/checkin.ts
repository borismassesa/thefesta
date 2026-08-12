/** Mirrors the response shapes of apps/opus_pass `/api/checkin/*` — the same
 *  contract the mobile app (apps/opus_pass_mobile/src/types/checkin.ts) codes
 *  against, so the door behaves identically on both clients. */

export interface ScannerEvent {
  id: string
  name: string | null
  event_type: string | null
  venue_name: string | null
  starts_at: string | null
}

export interface RosterEntry {
  invitationId: string
  fullName: string
  /** Short code printed on the ticket, for the manual fallback. */
  entryCode: string | null
  /** Globally unique admission identifier, printed under the QR. Unlike
   *  entryCode it resolves without knowing the event, so it is what a guest
   *  reads out. Null on invitations created before Pass IDs. */
  passId: string | null
  /** Headcount the guest RSVP'd for — the default offered at the door. */
  partySize: number
  checkedInAt: string | null
  /** How many actually arrived, once scanned. Null until then. */
  checkedInPartySize: number | null
  /** Which door admitted them, for the arrivals log. */
  checkedInDoor: string | null
  /** Audit label of who admitted them, e.g. "Asha (Main Gate) (manual: …)". */
  checkedInBy: string | null
  /** Free-text guest-list grouping the couple entered, e.g. "Bride's Family". */
  groupTag: string | null
  /** The guest's own number, for telling two similar names apart on a manual
   *  admission. WhatsApp number when there is one.
   *
   *  NOT carried by the roster: /validate returns every invited guest at
   *  once, and a personal field there would put the whole guest list's numbers
   *  on the device for the shift. This is populated per guest from /lookup, so
   *  it is null both when the couple recorded no number AND before the lookup
   *  has resolved — see withGuestDetail. Screens that show it track that
   *  difference themselves rather than reading "no number" from null. */
  phone: string | null
  /** Heuristic: the couple wrote "VIP" in the group tag. Not a real tier. */
  isVip: boolean
  /** Seating table this guest is assigned to (from Seat collection). Null
   *  when the guest hasn't been seated yet. */
  table: string | null
}

/**
 * Outcome of resolving a typed Pass ID before anyone is admitted.
 *
 * "Not found" and "couldn't ask" are kept apart deliberately. Collapsing them
 * tells an attendant holding a perfectly good ticket that the guest does not
 * exist, and they turn that guest away — the failure that actually needs
 * saying is that the server could not be reached.
 */
export type ManualLookupResult =
  | { status: 'found'; guest: RosterEntry }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

export type ResolveCodeResult = { ok: true; eventId: string } | { ok: false; error: string }

export type ValidateSessionResult =
  | {
      ok: true
      doorLabel: string
      /** Set when an admin assigned this code to a named attendant — the
       *  app must then skip asking who is scanning. */
      attendantName: string | null
      /** When the door code (and the attendant's shift) expires. The app ends
       *  the shift automatically once this passes. Null on older servers. */
      expiresAt: string | null
      event: ScannerEvent | null
      roster: RosterEntry[]
    }
  | { ok: false; error: string }

/**
 * Outcome of one scan.
 *  - success: admitted, `checkedInPartySize` recorded
 *  - duplicate: this pass was already used (first scan wins)
 *  - invalid: not a genuine pass, or a pass for a different event. NOT an
 *    unanswered RSVP any more: an invitation is enough to be admitted.
 *  - error: transport/server failure — retryable, nothing was recorded
 */
export interface CheckinScanResult {
  status: 'success' | 'duplicate' | 'invalid' | 'error'
  message?: string
  guestName?: string
  /** What they RSVP'd for. */
  partySize?: number
  /** What was actually admitted. */
  checkedInPartySize?: number | null
  checkedInAt?: string | null
  isVip?: boolean
  groupTag?: string | null
  /** Seating table this guest is assigned to (from Seat collection). Null
   *  when the guest hasn't been seated yet. */
  table?: string | null
}

/** A validated door session, persisted so a mid-shift restart doesn't force re-login. */
export interface ScannerSession {
  eventId: string
  accessToken: string
  doorLabel: string
  attendantName: string | null
  eventName: string | null
  /** ISO time the shift auto-ends (the door code's expiry). Null for sessions
   *  saved before auto-end shipped, or when the server didn't send one — those
   *  simply don't auto-end client-side (the server still rejects late scans). */
  expiresAt: string | null
}
