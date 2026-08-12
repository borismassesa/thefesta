/**
 * The tickets an entrance pass is sold as.
 *
 * Mirrors the canonical table in
 * apps/opus_pass/src/lib/dashboard/types.ts — that app owns the definition
 * because it owns the writes, and this app cannot import across the app
 * boundary. Keep the sizes in step with it: `size` is what gets stored in
 * `guest_contacts.max_party_size`, and the `guest_invitations` trigger derives
 * `entry_allowance` from it, so it is literally the number the door counts
 * down from.
 *
 * The scanner's badge text lives in ./scannerRoster (partySizeLabel) rather
 * than here: at the door an unrecognised count must fall back to "Party of N"
 * instead of being floored onto the nearest ticket.
 */

/** One seat. */
export const SINGLE_TICKET_PARTY = 1
/** Two seats on one QR — the guest and their partner. */
export const DOUBLE_TICKET_PARTY = 2
/** Wakwe is the in-laws' group ticket: ten people on one QR code. */
export const WAKWE_TICKET_PARTY = 10
