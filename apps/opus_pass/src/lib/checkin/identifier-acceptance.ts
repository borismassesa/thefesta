/**
 * Which admission identifiers one event's door accepts.
 *
 * Three can now reach the scanner: the QR credential, the legacy per-event
 * entry code, and the globally unique Pass ID. They cannot be retired
 * globally — an event whose tickets are already PRINTED with an entry code has
 * to keep accepting it, while an event created next month should not.
 *
 * Same shape as legacyCredentialsAllowed() in credential-core.ts: a pure
 * function over the event row plus `now`, so it is testable without a database
 * and gives the same answer everywhere it is asked.
 *
 * An explicit column value always wins. NULL means "derive it", which is what
 * lets the default move over time without an operator having to revisit every
 * event — see the migration comment for why nothing was backfilled.
 */

import { legacyCredentialsAllowed } from './credential-core'

export type AdmissionIdentifier = 'credential' | 'legacy_entry_code' | 'pass_id'

export interface EventAcceptanceRow {
  starts_at: string | null
  ends_at: string | null
  created_at?: string | null
  accepts_credential?: boolean | null
  accepts_entry_code?: boolean | null
  accepts_pass_id?: boolean | null
}

/**
 * How long after an event a printed entry code stays usable.
 *
 * Generous on purpose. The cost of accepting a stale entry code is close to
 * nothing — it identifies rather than authorises, and the door token is what
 * actually grants access. The cost of refusing a valid one is a real guest
 * standing at a gate holding a ticket the venue printed for them.
 */
const ENTRY_CODE_GRACE_DAYS = 30

export function acceptsIdentifier(
  event: EventAcceptanceRow,
  identifier: AdmissionIdentifier,
  now: Date = new Date(),
): boolean {
  switch (identifier) {
    case 'credential':
      // The primary path. An operator can still switch it off for one event
      // (a venue running entirely off a printed roster, say), but there is no
      // date-based retirement: this is the identifier everything else is
      // being retired IN FAVOUR of.
      return event.accepts_credential ?? true

    case 'legacy_entry_code':
      // Retires with the event, so tickets already in guests' hands keep
      // working and a code cannot be typed at an unrelated event months later.
      return event.accepts_entry_code ?? legacyCredentialsAllowed(event, now, ENTRY_CODE_GRACE_DAYS)

    case 'pass_id':
      // Every invitation carries one from 20260805000000 onward, and it does
      // not expire: a Pass ID is the stable identifier a guest can read out,
      // so retiring it on a timer would defeat the purpose.
      return event.accepts_pass_id ?? true
  }
}

/** Every identifier this event's door will accept right now. */
export function acceptedIdentifiers(
  event: EventAcceptanceRow,
  now: Date = new Date(),
): AdmissionIdentifier[] {
  return (['credential', 'legacy_entry_code', 'pass_id'] as const).filter((id) =>
    acceptsIdentifier(event, id, now),
  )
}

/**
 * Door-facing refusal text.
 *
 * Deliberately identical wording to "no guest found". An attendant learning
 * that a code is the RIGHT SHAPE but not accepted here has learned something
 * about the identifier space; a guest at the wrong event learning their code
 * "would work elsewhere" is a small leak of another event's existence. Both
 * refusals read the same.
 */
export function refusalMessage(identifier: AdmissionIdentifier): string {
  return identifier === 'pass_id'
    ? 'No guest found with that Pass ID'
    : 'No guest found with that code'
}
