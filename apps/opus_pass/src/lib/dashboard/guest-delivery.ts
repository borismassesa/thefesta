/**
 * Deliverability: may this guest be sent to?
 *
 * The rule the whole guest-identity effort exists to enforce:
 *
 *   No guest becomes deliverable until their identity, contact information
 *   and duplicate status are resolved.
 *
 * Until this module existed, the database prevented duplicates being CREATED
 * but nothing stopped one being SENT to. Two guests holding one handset still
 * produced two digital cards and two paid WhatsApp messages to that handset,
 * which is the cost the couple was being exposed to in the first place.
 *
 * One assessment, used by every outbound path. A second definition of
 * "deliverable" living in a send function is how the original defect happened
 * — the guard and the thing it guarded disagreed.
 *
 * Pure and browser-safe so the pre-send preview and the send itself cannot
 * reach different verdicts.
 */

import { phoneLooksValid, type GuestIdentity } from './guest-duplicates'

export type DeliveryBlockReason =
  /** No number at all. */
  | 'missing_phone'
  /** Digits present, but not a usable number. */
  | 'invalid_phone'
  /** Another guest holds this number and nobody has confirmed the sharing. */
  | 'unresolved_duplicate'

export interface GuestDeliveryStatus {
  guestId: string
  name: string
  phoneNormalized: string | null
  deliverable: boolean
  reason: DeliveryBlockReason | null
  /** Specific, actionable text — never just "there is an error". */
  detail: string
  /** Other guests who would receive on this SAME number. */
  sharesNumberWith: string[]
}

export const BLOCK_LABELS: Record<DeliveryBlockReason, string> = {
  missing_phone: 'No phone number',
  invalid_phone: 'Invalid phone number',
  unresolved_duplicate: 'Duplicate phone, not resolved',
}

/**
 * Assess every guest on the roster at once.
 *
 * Whole-roster rather than per-guest because deliverability is a property of
 * the SET: whether a number is duplicated can only be known by looking at
 * everyone else. A per-guest check would have to re-scan the roster each time,
 * and a send loop doing that per recipient is how a 700-guest send turns into
 * 700 round trips.
 */
export function assessRosterDelivery(
  roster: readonly GuestIdentity[],
): Map<string, GuestDeliveryStatus> {
  const byNumber = new Map<string, GuestIdentity[]>()
  for (const guest of roster) {
    if (!guest.phoneNormalized) continue
    const list = byNumber.get(guest.phoneNormalized) ?? []
    list.push(guest)
    byNumber.set(guest.phoneNormalized, list)
  }

  const assessed = new Map<string, GuestDeliveryStatus>()
  for (const guest of roster) {
    if (!guest.id) continue
    const sharing = guest.phoneNormalized ? (byNumber.get(guest.phoneNormalized) ?? []) : []
    const others = sharing.filter((g) => g.id !== guest.id).map((g) => g.fullName)

    const base = {
      guestId: guest.id,
      name: guest.fullName,
      phoneNormalized: guest.phoneNormalized,
      sharesNumberWith: others,
    }

    if (!guest.phoneNormalized) {
      assessed.set(guest.id, {
        ...base,
        deliverable: false,
        reason: 'missing_phone',
        detail: 'No phone number. Add one before sending.',
      })
      continue
    }
    if (!phoneLooksValid(guest.phoneNormalized)) {
      assessed.set(guest.id, {
        ...base,
        deliverable: false,
        reason: 'invalid_phone',
        detail: `${guest.phoneNormalized} is not a usable number. Correct it before sending.`,
      })
      continue
    }
    if (others.length > 0) {
      // Sharing is only safe to send on once someone has SAID it is safe.
      // The group id alone means "recorded as shared", which includes pairs
      // parked pending a decision — those must not be sent to.
      const everyoneConfirmed = sharing.every((g) => g.sharedContactConfirmed)
      if (!everyoneConfirmed) {
        assessed.set(guest.id, {
          ...base,
          deliverable: false,
          reason: 'unresolved_duplicate',
          detail: `Shares ${guest.phoneNormalized} with ${others.join(', ')}. Confirm or correct before sending.`,
        })
        continue
      }
      assessed.set(guest.id, {
        ...base,
        deliverable: true,
        reason: null,
        detail: `Confirmed shared contact with ${others.join(', ')}. This number receives ${sharing.length} messages.`,
      })
      continue
    }

    assessed.set(guest.id, { ...base, deliverable: true, reason: null, detail: '' })
  }
  return assessed
}

export interface SendEligibility {
  /** Guest ids clear to send to. */
  eligible: string[]
  /** Everyone held back, each with a reason. Never a bare count. */
  skipped: { guestId: string; name: string; reason: DeliveryBlockReason; detail: string }[]
  /** Distinct handsets the eligible guests resolve to. */
  distinctNumbers: number
  /**
   * Messages that would land on a number already receiving another. Nonzero
   * means the couple pays more than once for one handset — always shown
   * before a send, never discovered on the bill.
   */
  repeatedRecipients: { phone: string; guests: string[] }[]
}

/** Split a candidate list into what will send and what will not, with reasons. */
export function resolveSendEligibility(
  guestIds: readonly string[],
  assessed: ReadonlyMap<string, GuestDeliveryStatus>,
): SendEligibility {
  const eligible: string[] = []
  const skipped: SendEligibility['skipped'] = []
  const numbers = new Map<string, string[]>()

  for (const id of guestIds) {
    const status = assessed.get(id)
    if (!status) continue
    if (!status.deliverable) {
      skipped.push({
        guestId: id,
        name: status.name,
        reason: status.reason ?? 'missing_phone',
        detail: status.detail,
      })
      continue
    }
    eligible.push(id)
    if (status.phoneNormalized) {
      const list = numbers.get(status.phoneNormalized) ?? []
      list.push(status.name)
      numbers.set(status.phoneNormalized, list)
    }
  }

  return {
    eligible,
    skipped,
    distinctNumbers: numbers.size,
    repeatedRecipients: [...numbers.entries()]
      .filter(([, guests]) => guests.length > 1)
      .map(([phone, guests]) => ({ phone, guests })),
  }
}
