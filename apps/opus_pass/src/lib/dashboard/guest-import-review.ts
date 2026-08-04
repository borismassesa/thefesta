/**
 * Staged import: work out what an upload WOULD do, before it does it.
 *
 * The previous importer inserted immediately and returned three integers
 * (`imported`, `skippedDuplicates`, `skippedNoName`). A row whose number
 * already existed was dropped silently — the admin was told "2 skipped as
 * duplicates" and never which two, or against whom.
 *
 * That is not a hypothetical cost. On the Moses Seeta list it dropped Mama
 * Meena's 0766241854 (it collided with a row later in the same file). Her
 * record survived with NO number at all, indistinguishable from the seven
 * guests who genuinely never gave one, and the number was re-added by hand to
 * a different guest hours later. The data loss was invisible because the
 * outcome was a count.
 *
 * So: every row gets a named status, nothing is dropped without being shown,
 * and the admin decides. Pure and browser-safe — the review screen and the
 * server action must classify identically, or the screen would promise a
 * result the commit does not deliver.
 */

import {
  findDuplicates,
  guestPhoneKey,
  normalizeGuestName,
  phoneLooksValid,
  toIdentity,
  type DuplicateMatch,
  type GuestIdentity,
} from './guest-duplicates'
import type { GuestImportRow } from './guest-import-rows'

export type ImportRowStatus =
  /** Nothing wrong. Imports on commit. */
  | 'ready'
  /** Number belongs to another guest. Refused by the database. */
  | 'duplicate_phone'
  /** Same name already on the roster. Refused by the database. */
  | 'duplicate_name'
  /** Close enough to need a human decision. Held, not auto-accepted. */
  | 'needs_review'
  /** Worth seeing, never blocking. Imports with the warning attached. */
  | 'possible_duplicate'
  /** No number. Imports fine, but cannot be sent to. */
  | 'missing_phone'
  /** Has digits, but not a usable number. */
  | 'invalid_phone'
  /** No name in the name column. Cannot import. */
  | 'missing_name'

/**
 * The independent things that can be wrong with one row.
 *
 * Kept as flags rather than folded straight into a status because a row can
 * carry several at once and the status can only name one. Running the real
 * 121-row Moses Seeta file caught this: Gwamaka Mwakugile has no phone number
 * AND resembles Mama Mwakugile, and a single status silently dropped the
 * missing phone from both the row and the totals.
 */
export interface ImportRowFlags {
  hasExactPhoneDuplicate: boolean
  hasExactNameDuplicate: boolean
  hasProbableNameDuplicate: boolean
  hasPossibleRelationship: boolean
  hasMissingPhone: boolean
  hasInvalidPhone: boolean
  hasMissingName: boolean
}

/** Derive the one headline status from the flags, worst first. */
export function deriveImportStatus(flags: ImportRowFlags): ImportRowStatus {
  if (flags.hasMissingName) return 'missing_name'
  if (flags.hasExactPhoneDuplicate) return 'duplicate_phone'
  if (flags.hasExactNameDuplicate) return 'duplicate_name'
  if (flags.hasInvalidPhone) return 'invalid_phone'
  if (flags.hasProbableNameDuplicate) return 'needs_review'
  if (flags.hasMissingPhone) return 'missing_phone'
  if (flags.hasPossibleRelationship) return 'possible_duplicate'
  return 'ready'
}

/**
 * Statuses that stop a row from being written on commit.
 *
 * `possible_duplicate` is deliberately absent. Your Level 3 — a shared
 * surname, one name a prefix of another — is "visible to the administrator but
 * should not automatically block import". On the real file that rule covers 13
 * of 121 rows; holding all of them would train an admin to bulk-approve the
 * review screen, which would then also wave through the two conflicts that
 * genuinely matter.
 *
 * `missing_phone` is absent for a different reason: refusing those rows pushes
 * admins into inventing placeholder numbers, which is worse than a recorded
 * gap. The guest still needs a seat, a table and an entrance pass. They import,
 * and are held out of message sends instead.
 */
const BLOCKING: ReadonlySet<ImportRowStatus> = new Set<ImportRowStatus>([
  'duplicate_phone',
  'duplicate_name',
  'needs_review',
  'missing_name',
  'invalid_phone',
])

export function statusBlocksImport(status: ImportRowStatus): boolean {
  return BLOCKING.has(status)
}

/**
 * A guest with no number is deliberately NOT blocked. Refusing them would
 * push admins into inventing placeholder numbers, which is far worse than a
 * recorded gap: the guest still needs a seat, a table and an entrance pass.
 * They import, and are held out of message sends instead.
 */
export interface ImportReviewRow {
  /** 1-based position in the uploaded file, so the admin can find the row. */
  lineNumber: number
  row: GuestImportRow
  status: ImportRowStatus
  flags: ImportRowFlags
  /** Canonical number, for display and for the commit's own re-check. */
  phoneNormalized: string | null
  /** Everything this row resembles: existing guests AND earlier rows in the
   *  same file. Ordered strongest first. */
  matches: DuplicateMatch[]
  /** Short, specific text for the Issues column. Empty when ready. */
  issues: string[]
  /** Whether this row is selected for import. Blocking rows start false, and
   *  "keep both" is deliberately never the default. */
  approved: boolean
}

/**
 * Counts are per-ISSUE, not per-status, so they do not disagree with the rows.
 * `missingPhone` counts every row lacking a number even when its headline
 * status is a duplicate; `ready` counts rows with no issue at all. They
 * therefore overlap and deliberately do not sum to `total` — `total`,
 * `importable` and `blocked` are the three that partition it.
 */
export interface GuestImportPreview {
  rows: ImportReviewRow[]
  counts: {
    total: number
    /** No issues whatsoever. */
    ready: number
    /** Rows that will be written on commit: ready + non-blocking issues. */
    importable: number
    /** Rows held for a decision. `importable + blocked === total`. */
    blocked: number
    duplicatePhone: number
    duplicateName: number
    needsReview: number
    possibleDuplicate: number
    missingPhone: number
    invalidPhone: number
    missingName: number
    /** Distinct numbers claimed by more than one row across file + roster. */
    conflictGroups: number
  }
}

/**
 * Classify every row of an upload against the existing roster AND against the
 * rows before it in the same file.
 *
 * Both comparisons matter and the in-file one is the easily missed half: the
 * Moses Seeta duplicates were two pairs *within a single upload*, so checking
 * only against the roster would have passed the whole file.
 */
export function buildImportPreview(
  rows: readonly GuestImportRow[],
  roster: readonly GuestIdentity[],
): GuestImportPreview {
  const reviewed: ImportReviewRow[] = []
  // Grows as we go, so row 36 is compared against row 35 of the same file.
  const seen: GuestIdentity[] = [...roster]

  rows.forEach((row, index) => {
    const lineNumber = index + 1
    const fullName = (row.full_name ?? '').trim()
    const phoneNormalized = guestPhoneKey(row.phone)
    const hadDigits = /\d/.test(row.phone ?? '')

    const identity: GuestIdentity = toIdentity({
      id: null,
      full_name: fullName,
      phone: row.phone,
      whatsapp_phone: row.phone,
    })
    // An unnamed row is still compared, so its number is not free to be
    // claimed again by a later row that the admin might approve.
    const matches = fullName ? findDuplicates(identity, seen) : []

    const flags: ImportRowFlags = {
      hasMissingName: !fullName,
      hasExactPhoneDuplicate: matches.some(
        (m) => m.level === 'blocked' && /Phone number is already assigned/.test(m.reason),
      ),
      hasExactNameDuplicate: matches.some(
        (m) => m.level === 'blocked' && /already on the list/.test(m.reason),
      ),
      hasProbableNameDuplicate: matches.some((m) => m.level === 'review'),
      hasPossibleRelationship: matches.some((m) => m.level === 'possible'),
      hasMissingPhone: !phoneNormalized && !hadDigits,
      hasInvalidPhone: hadDigits && (!phoneNormalized || !phoneLooksValid(phoneNormalized)),
    }

    // Every flag contributes its own line, so an issue is never hidden by a
    // more severe one sharing the row.
    const issues: string[] = matches.map((m) => m.reason)
    if (flags.hasMissingName) issues.push('No name in the name column')
    if (flags.hasMissingPhone) issues.push('No phone number. Cannot receive WhatsApp or a digital card')
    if (flags.hasInvalidPhone) issues.push(`Not a usable phone number: ${(row.phone ?? '').trim()}`)

    const status = deriveImportStatus(flags)
    reviewed.push({
      lineNumber,
      row,
      status,
      flags,
      phoneNormalized,
      matches,
      issues,
      approved: !statusBlocksImport(status),
    })

    // A blocked row still joins the comparison set: if three rows claim one
    // number, the third must be reported against the first, not pass because
    // the second was rejected.
    seen.push(identity)
  })

  const countFlag = (pick: (f: ImportRowFlags) => boolean) => reviewed.filter((r) => pick(r.flags)).length
  const conflictNumbers = new Set(
    reviewed.filter((r) => r.flags.hasExactPhoneDuplicate && r.phoneNormalized).map((r) => r.phoneNormalized),
  )
  const blocked = reviewed.filter((r) => statusBlocksImport(r.status)).length

  return {
    rows: reviewed,
    counts: {
      total: reviewed.length,
      ready: reviewed.filter((r) => r.status === 'ready').length,
      importable: reviewed.length - blocked,
      blocked,
      duplicatePhone: countFlag((f) => f.hasExactPhoneDuplicate),
      duplicateName: countFlag((f) => f.hasExactNameDuplicate),
      needsReview: countFlag((f) => f.hasProbableNameDuplicate),
      possibleDuplicate: countFlag((f) => f.hasPossibleRelationship),
      missingPhone: countFlag((f) => f.hasMissingPhone),
      invalidPhone: countFlag((f) => f.hasInvalidPhone),
      missingName: countFlag((f) => f.hasMissingName),
      conflictGroups: conflictNumbers.size,
    },
  }
}

/**
 * Post-import reconciliation: does the stored roster actually match the file?
 *
 * "How does the admin know the imported contacts are correct against the
 * spreadsheet?" is not answered by the importer reporting its own success —
 * that is the importer marking its own homework, and it is exactly what hid
 * the Mama Meena loss (the old one reported "imported: N" and was telling the
 * truth about what it wrote, just not about what the file said).
 *
 * So this compares the FILE against the roster read back OUT of the database
 * afterwards. Every row lands in one of three buckets, and they sum to the
 * file's row count, so a file can always be reconciled line by line.
 */
export type VerificationVerdict =
  /** A stored guest carries this row's name and number. */
  | 'matched'
  /** A stored guest matches on one of name/number but not the other. */
  | 'differs'
  /** Nothing in the roster corresponds to this row. */
  | 'missing'

export interface VerificationRow {
  lineNumber: number
  fileName: string
  filePhone: string | null
  verdict: VerificationVerdict
  /** What is actually stored, when something is. */
  storedName: string | null
  storedPhone: string | null
  detail: string
}

export interface GuestImportVerification {
  rows: VerificationRow[]
  matched: number
  differs: number
  missing: number
}

export function buildImportVerification(
  rows: readonly GuestImportRow[],
  roster: readonly GuestIdentity[],
): GuestImportVerification {
  const byPhone = new Map<string, GuestIdentity>()
  const byName = new Map<string, GuestIdentity>()
  for (const guest of roster) {
    if (guest.phoneNormalized && !byPhone.has(guest.phoneNormalized)) byPhone.set(guest.phoneNormalized, guest)
    const key = normalizeGuestName(guest.fullName)
    if (key && !byName.has(key)) byName.set(key, guest)
  }

  const verified = rows.map((row, index) => {
    const lineNumber = index + 1
    const fileName = (row.full_name ?? '').trim()
    const filePhone = guestPhoneKey(row.phone)
    const nameKey = normalizeGuestName(fileName)

    const phoneMatch = filePhone ? byPhone.get(filePhone) : undefined
    const nameMatch = nameKey ? byName.get(nameKey) : undefined

    const base = { lineNumber, fileName, filePhone }

    // Both agree, and on the same guest: the row is genuinely stored.
    if (phoneMatch && nameMatch && phoneMatch.id === nameMatch.id) {
      return {
        ...base,
        verdict: 'matched' as const,
        storedName: phoneMatch.fullName,
        storedPhone: phoneMatch.phoneNormalized,
        detail: 'Stored as written in the file',
      }
    }
    // A row with no number can only ever be checked by name.
    if (!filePhone && nameMatch) {
      return {
        ...base,
        verdict: 'matched' as const,
        storedName: nameMatch.fullName,
        storedPhone: nameMatch.phoneNormalized,
        detail: nameMatch.phoneNormalized
          ? `Stored, and now has a number (${nameMatch.phoneNormalized}) the file did not carry`
          : 'Stored. Still has no phone number',
      }
    }
    if (phoneMatch) {
      return {
        ...base,
        verdict: 'differs' as const,
        storedName: phoneMatch.fullName,
        storedPhone: phoneMatch.phoneNormalized,
        detail: `That number is stored against "${phoneMatch.fullName}", not "${fileName}"`,
      }
    }
    if (nameMatch) {
      return {
        ...base,
        verdict: 'differs' as const,
        storedName: nameMatch.fullName,
        storedPhone: nameMatch.phoneNormalized,
        detail: nameMatch.phoneNormalized
          ? `Stored with a different number: ${nameMatch.phoneNormalized}`
          : 'Stored, but with no phone number',
      }
    }
    return {
      ...base,
      verdict: 'missing' as const,
      storedName: null,
      storedPhone: null,
      detail: 'Not on the guest list',
    }
  })

  return {
    rows: verified,
    matched: verified.filter((r) => r.verdict === 'matched').length,
    differs: verified.filter((r) => r.verdict === 'differs').length,
    missing: verified.filter((r) => r.verdict === 'missing').length,
  }
}

/** Human label for a status, shared by the review screen and the guest table. */
export const IMPORT_STATUS_LABELS: Record<ImportRowStatus, string> = {
  ready: 'Ready',
  duplicate_phone: 'Duplicate phone',
  duplicate_name: 'Duplicate name',
  needs_review: 'Needs review',
  possible_duplicate: 'Possible duplicate',
  missing_phone: 'Missing phone',
  invalid_phone: 'Invalid phone',
  missing_name: 'Missing name',
}
