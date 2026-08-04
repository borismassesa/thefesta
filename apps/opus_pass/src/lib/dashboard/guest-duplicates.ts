/**
 * Guest identity: deciding when two guest records are the same person.
 *
 * Pure and browser-safe (no Supabase, no `server-only`) so the import preview,
 * the manual-entry guard and the tests all share one definition. A second
 * definition is how the original defect happened: `createGuest` compared raw
 * digits while every send path compared `normalizePhone(...)` output, so the
 * guard and the thing it was guarding disagreed about what "the same number"
 * meant.
 *
 * The phone rule here MUST match `opuspass_normalize_phone()` in
 * 20260804160000_guest_phone_normalization.sql. The database is the real
 * enforcement point; this layer exists to explain a conflict before the
 * database refuses it.
 */

import { normalizePhone } from './share'

/** The number a send would actually go to — the key that decides whether two
 *  guest records are one recipient. Mirrors the fallback used by
 *  entrance-pass-send, sendWhatsAppInvites and the pledge sends. */
export function guestPhoneKey(
  phone: string | null | undefined,
  whatsappPhone?: string | null | undefined,
): string | null {
  return normalizePhone(whatsappPhone?.trim() || phone?.trim() || null)
}

/** A Tanzanian mobile in canonical form is 255 + 9 digits. Numbers outside TZ
 *  keep their own country code and are only length-checked loosely — we cannot
 *  validate a plan we don't know. */
export function phoneLooksValid(normalized: string | null): boolean {
  if (!normalized) return false
  if (normalized.startsWith('255')) return /^255[67]\d{8}$/.test(normalized)
  return normalized.length >= 8 && normalized.length <= 15
}

/** Honorifics and family words that must not stop two records matching.
 *  "Mr & Mrs G. Msuya" and "G Msuya" are the same household. */
const TITLES: ReadonlySet<string> = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'eng', 'hon',
  'bw', 'bi', 'ndg', 'ndugu', 'mzee',
  'mama', 'baba', 'familia', 'family',
])

/**
 * Comparison form of a guest name: lowercased, punctuation stripped, titles
 * removed, whitespace collapsed.
 *
 *   "Mr & Mrs G. Msuya" -> "g msuya"
 *   "Mama Meena"        -> "meena"
 *
 * Titles are only dropped while something else remains: a guest genuinely
 * recorded as just "Mama" keeps that as their name rather than normalizing to
 * the empty string and matching every other title-only record.
 */
export function normalizeGuestName(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  const tokens = cleaned.split(' ')
  const withoutTitles = tokens.filter((t) => !TITLES.has(t))
  return (withoutTitles.length ? withoutTitles : tokens).join(' ')
}

/** Name tokens for order-insensitive matching and search: "Munisi Robert"
 *  finds "Robert Munisi". */
export function guestNameTokens(raw: string | null | undefined): string[] {
  const normalized = normalizeGuestName(raw)
  return normalized ? normalized.split(' ') : []
}

/**
 * How confident we are that two records are the same person.
 *
 * `blocked` is reserved for the cases the database itself refuses, so the UI
 * never promises a save that the unique index will then reject.
 */
export type DuplicateLevel =
  /** Same normalized number, or same normalized name. The write is refused. */
  | 'blocked'
  /** Close but not identical. Held for a human decision, not auto-accepted. */
  | 'review'
  /** Worth seeing, never blocking. Shared surname, one name a prefix of another. */
  | 'possible'

export interface DuplicateMatch {
  level: DuplicateLevel
  /** Which rule fired, for the Issues column. */
  reason: string
  /** The guest already on the roster (or the earlier row in the same file). */
  existingId: string | null
  existingName: string
}

/** A roster row reduced to what duplicate detection needs. */
export interface GuestIdentity {
  id: string | null
  fullName: string
  phoneNormalized: string | null
  /** Set when this row is recorded as sharing its number with another guest,
   *  whether deliberately or pending a decision. */
  sharedContactGroupId?: string | null
  /** True only when an admin has confirmed both guests may be sent to. */
  sharedContactConfirmed?: boolean
}

export function toIdentity(guest: {
  id?: string | null
  full_name?: string | null
  phone?: string | null
  whatsapp_phone?: string | null
  shared_contact_group_id?: string | null
  shared_contact_confirmed?: boolean | null
}): GuestIdentity {
  return {
    id: guest.id ?? null,
    fullName: (guest.full_name ?? '').trim(),
    phoneNormalized: guestPhoneKey(guest.phone, guest.whatsapp_phone),
    sharedContactGroupId: guest.shared_contact_group_id ?? null,
    sharedContactConfirmed: guest.shared_contact_confirmed ?? false,
  }
}

/**
 * Levenshtein distance, capped: we only care whether two names are within a
 * couple of edits, so the full matrix is wasted work on long strings that
 * differ wildly. Returns `max + 1` once the distance is known to exceed `max`.
 */
function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      row.push(value)
      if (value < best) best = value
    }
    if (best > max) return max + 1
    prev = row
  }
  return prev[b.length]
}

/**
 * Compare one candidate against the records already known.
 *
 * Returns every match, strongest first, rather than only the first hit: a row
 * can clash on its number with one guest and resemble a second by name, and an
 * admin resolving the conflict needs to see both.
 */
export function findDuplicates(
  candidate: GuestIdentity,
  existing: readonly GuestIdentity[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = []
  const candidateName = normalizeGuestName(candidate.fullName)
  const candidateTokens = new Set(guestNameTokens(candidate.fullName))

  for (const other of existing) {
    if (candidate.id && other.id && candidate.id === other.id) continue
    const otherName = normalizeGuestName(other.fullName)

    // ── Same number ─────────────────────────────────────────────────────────
    if (candidate.phoneNormalized && candidate.phoneNormalized === other.phoneNormalized) {
      // A CONFIRMED shared contact is a decision already taken. It still shows,
      // so a send preview can warn about the repeated recipient, but it no
      // longer blocks the save. Merely carrying a group id is not enough:
      // a pair parked pending a coordinator's decision carries one too, and
      // treating that as settled would wave through the very conflict the
      // group id was created to hold.
      const approved = Boolean(
        other.sharedContactGroupId &&
          candidate.sharedContactGroupId &&
          other.sharedContactConfirmed &&
          candidate.sharedContactConfirmed,
      )
      matches.push({
        level: approved ? 'possible' : 'blocked',
        reason: approved
          ? `Shares an approved contact number with ${other.fullName}`
          : `Phone number is already assigned to ${other.fullName}`,
        existingId: other.id,
        existingName: other.fullName,
      })
      continue
    }

    if (!candidateName || !otherName) continue

    // ── Same name ───────────────────────────────────────────────────────────
    if (candidateName === otherName) {
      matches.push({
        level: 'blocked',
        reason: `A guest named ${other.fullName} is already on the list`,
        existingId: other.id,
        existingName: other.fullName,
      })
      continue
    }

    // ── Near-identical name: "Baraka Mwalwega" vs "Baraka Mwalenga" ─────────
    // Two edits over a name this short is a typo far more often than it is two
    // different people, so it is held for review rather than accepted.
    const distance = editDistance(candidateName, otherName, 2)
    if (distance <= 2 && Math.min(candidateName.length, otherName.length) >= 6) {
      matches.push({
        level: 'review',
        reason: `Very similar to ${other.fullName}`,
        existingId: other.id,
        existingName: other.fullName,
      })
      continue
    }

    // ── One name contained in the other: "Joel" vs "Joel Leo" ──────────────
    const otherTokenList = guestNameTokens(other.fullName)
    const otherTokens = new Set(otherTokenList)
    const shared = [...candidateTokens].filter((t) => otherTokens.has(t))
    if (shared.length === 0) continue

    const containment = shared.length === candidateTokens.size || shared.length === otherTokens.size
    if (containment) {
      matches.push({
        level: 'possible',
        reason: `May be the same guest as ${other.fullName}`,
        existingId: other.id,
        existingName: other.fullName,
      })
      continue
    }

    // A shared SURNAME is worth showing — families are invited together and
    // one of them may be a mis-keyed repeat. A shared first name is not:
    // "Matilda Mabula" and "Matilda Nkembo" are two women called Matilda, and
    // on a 700-row list that rule fires often enough to bury the real
    // conflicts it sits beside.
    const candidateList = [...candidateTokens]
    const surnameShared =
      shared.includes(candidateList[candidateList.length - 1]) ||
      shared.includes(otherTokenList[otherTokenList.length - 1])
    if (surnameShared) {
      matches.push({
        level: 'possible',
        reason: `Shares a surname with ${other.fullName}`,
        existingId: other.id,
        existingName: other.fullName,
      })
    }
  }

  const order: Record<DuplicateLevel, number> = { blocked: 0, review: 1, possible: 2 }
  return matches.sort((a, b) => order[a.level] - order[b.level])
}

/** The strongest level present, or null when the record is clean. */
export function worstLevel(matches: readonly DuplicateMatch[]): DuplicateLevel | null {
  if (matches.some((m) => m.level === 'blocked')) return 'blocked'
  if (matches.some((m) => m.level === 'review')) return 'review'
  if (matches.some((m) => m.level === 'possible')) return 'possible'
  return null
}
