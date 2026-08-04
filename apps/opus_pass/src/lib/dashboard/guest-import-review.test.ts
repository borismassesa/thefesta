import assert from 'node:assert/strict'
import test from 'node:test'
import { buildImportPreview, buildImportVerification, statusBlocksImport } from './guest-import-review'
import { toIdentity, type GuestIdentity } from './guest-duplicates'
import type { GuestImportRow } from './guest-import-rows'

function row(full_name: string, phone: string | null, max_party_size = 1): GuestImportRow {
  return { full_name, email: null, phone, max_party_size }
}

function rosterGuest(fullName: string, phone: string | null, id: string): GuestIdentity {
  return toIdentity({ id, full_name: fullName, phone, whatsapp_phone: phone })
}

/**
 * The upload that exposed the defect, reduced to the rows that matter. Numbers
 * and positions are the real ones from
 * Moses_Seeta_Guest_List_CORRECTED_With_Ticket_Type.csv.
 */
const MOSES_SEETA = [
  row('Mr & Mrs Ngando', '0762269228', 2),
  row('Joel', null),
  row('Joyce Nkembo', '0784310065', 2),
  row('Robert Munisi', '0757200767', 2), // #35
  row('Mr & Mrs Lameck', '0757200767', 2), // #36 — same number
  row('Mama Meena', '0766241854'), // #44
  row('Familia Aden', null), // #45
  row('Mr & Mrs G. Msuya', '0766241854', 2), // #46 — same number
]

test('the two real conflicts are reported, not silently dropped', () => {
  const preview = buildImportPreview(MOSES_SEETA, [])

  assert.equal(preview.counts.duplicatePhone, 2)
  assert.equal(preview.counts.conflictGroups, 2)

  const lameck = preview.rows.find((r) => r.row.full_name === 'Mr & Mrs Lameck')!
  assert.equal(lameck.status, 'duplicate_phone')
  assert.match(lameck.issues[0], /already assigned to Robert Munisi/)

  const msuya = preview.rows.find((r) => r.row.full_name === 'Mr & Mrs G. Msuya')!
  assert.equal(msuya.status, 'duplicate_phone')
  assert.match(msuya.issues[0], /already assigned to Mama Meena/)
})

test('the guest whose number was eaten keeps it', () => {
  // The regression that cost Mama Meena her number: SHE was first, so she is
  // ready and it is the later row that is held. The old importer dropped
  // whichever row lost the race and kept no record of the number at all.
  const preview = buildImportPreview(MOSES_SEETA, [])
  const meena = preview.rows.find((r) => r.row.full_name === 'Mama Meena')!
  assert.equal(meena.status, 'ready')
  assert.equal(meena.phoneNormalized, '255766241854')
  assert.equal(meena.approved, true)
})

test('duplicates within one file are caught, not only against the roster', () => {
  // Both Moses Seeta pairs were inside a single upload. A roster-only check
  // would have passed the whole file.
  const preview = buildImportPreview(MOSES_SEETA, [])
  assert.ok(preview.counts.duplicatePhone > 0, 'in-file duplicates must be detected with an empty roster')
})

test('a duplicate against an existing roster guest is caught too', () => {
  const roster = [rosterGuest('Robert Munisi', '+255757200767', 'g1')]
  const preview = buildImportPreview([row('Mr & Mrs Lameck', '0757200767', 2)], roster)
  assert.equal(preview.rows[0].status, 'duplicate_phone')
  assert.equal(preview.rows[0].matches[0].existingId, 'g1')
})

test('the seven guests with no number import, but are marked undeliverable', () => {
  const preview = buildImportPreview(MOSES_SEETA, [])
  const joel = preview.rows.find((r) => r.row.full_name === 'Joel')!
  assert.equal(joel.status, 'missing_phone')
  // Deliberately importable: refusing them would push admins into inventing
  // placeholder numbers, and the guest still needs a seat and a pass.
  assert.equal(statusBlocksImport('missing_phone'), false)
  assert.equal(joel.approved, true)
  assert.match(joel.issues[0], /Cannot receive WhatsApp/)
  assert.equal(preview.counts.missingPhone, 2) // Joel + Familia Aden
})

test('blocking rows are never pre-approved — "keep both" is not the default', () => {
  const preview = buildImportPreview(MOSES_SEETA, [])
  for (const r of preview.rows) {
    if (statusBlocksImport(r.status)) {
      assert.equal(r.approved, false, `${r.row.full_name} must not be pre-approved`)
    }
  }
})

test('a third row on the same number is reported against the first', () => {
  // The second row is blocked; the third must not slip through because of it.
  const preview = buildImportPreview(
    [row('Robert Munisi', '0757200767'), row('Mr & Mrs Lameck', '0757200767'), row('Third Guest', '0757200767')],
    [],
  )
  assert.equal(preview.counts.duplicatePhone, 2)
  assert.equal(preview.counts.conflictGroups, 1, 'all three claim ONE number')
})

test('counts reconcile with the file — no row is unaccounted for', () => {
  const preview = buildImportPreview(MOSES_SEETA, [])
  const { total, importable, blocked } = preview.counts
  assert.equal(total, MOSES_SEETA.length)
  // importable/blocked partition the file; the per-issue counts deliberately
  // overlap, since one row can carry several issues at once.
  assert.equal(importable + blocked, total)
  assert.equal(blocked, preview.rows.filter((r) => !r.approved).length)
})

test('a row with two problems reports both', () => {
  // The real regression: Gwamaka Mwakugile has no number AND resembles Mama
  // Mwakugile. A single status hid the missing phone from the totals.
  const preview = buildImportPreview([row('Mama Mwakugile', '0784833999'), row('Gwamaka Mwakugile', null)], [])
  const gwamaka = preview.rows[1]
  assert.equal(gwamaka.flags.hasMissingPhone, true)
  assert.equal(gwamaka.flags.hasPossibleRelationship, true)
  assert.equal(preview.counts.missingPhone, 1, 'the missing phone must still be counted')
  assert.ok(gwamaka.issues.length >= 2, 'both issues must be listed')
})

test('a Level 3 relationship warns but still imports', () => {
  // "should be visible to the administrator but should not automatically
  // block import" — 13 of the real 121 rows land here.
  const preview = buildImportPreview([row('Joel Leo', '0657286868'), row('Joel', '0755000111')], [])
  const joel = preview.rows[1]
  assert.equal(joel.status, 'possible_duplicate')
  assert.equal(joel.approved, true, 'Level 3 must not block')
  assert.ok(joel.issues.length > 0, 'but it must still be visible')
})

test('a Level 2 near-miss is held for a decision', () => {
  const preview = buildImportPreview([row('Mr & Mrs Ngando', '0762269228'), row('Mr & Mrs Mbando', '0755000111')], [])
  const mbando = preview.rows[1]
  assert.equal(mbando.status, 'needs_review')
  assert.equal(mbando.approved, false)
})

test('a shared first name alone is not reported', () => {
  // "Matilda Mabula" vs "Matilda Nkembo" are two women called Matilda. On a
  // 700-row list this rule fired often enough to bury the real conflicts.
  const preview = buildImportPreview([row('Matilda Nkembo', '0755000111'), row('Matilda Mabula', '0755000222')], [])
  assert.equal(preview.rows[1].status, 'ready')
})

test('a row with digits that are not a real number is invalid, not missing', () => {
  const preview = buildImportPreview([row('Bad Number', '12345')], [])
  assert.equal(preview.rows[0].status, 'invalid_phone')
  assert.match(preview.rows[0].issues[0], /Not a usable phone number/)
})

test('an unnamed row cannot import', () => {
  const preview = buildImportPreview([row('   ', '0755000111')], [])
  assert.equal(preview.rows[0].status, 'missing_name')
  assert.equal(preview.rows[0].approved, false)
})

test('line numbers point back at the uploaded file', () => {
  const preview = buildImportPreview(MOSES_SEETA, [])
  assert.equal(preview.rows[0].lineNumber, 1)
  assert.equal(preview.rows[MOSES_SEETA.length - 1].lineNumber, MOSES_SEETA.length)
})

test('a clean file needs no review', () => {
  const preview = buildImportPreview(
    [row('Joyce Nkembo', '0784310065', 2), row('Mr & Mrs Ngando', '0762269228', 2)],
    [],
  )
  assert.equal(preview.counts.ready, 2)
  assert.equal(preview.counts.conflictGroups, 0)
  assert.ok(preview.rows.every((r) => r.approved && r.issues.length === 0))
})

// ── Post-import reconciliation ─────────────────────────────────────────────

test('a file that imported cleanly reconciles with no problems', () => {
  const roster = [rosterGuest('Joyce Nkembo', '0784310065', 'g1'), rosterGuest('Mr & Mrs Ngando', '0762269228', 'g2')]
  const result = buildImportVerification(
    [row('Joyce Nkembo', '0784310065', 2), row('Mr & Mrs Ngando', '0762269228', 2)],
    roster,
  )
  assert.equal(result.matched, 2)
  assert.equal(result.differs, 0)
  assert.equal(result.missing, 0)
})

test('a row the importer dropped is reported as missing', () => {
  // The Mama Meena case. The old importer would have said "imported: 1" and
  // been telling the truth about its own work while the file went unhonoured.
  const roster = [rosterGuest('Mama Meena', '0766241854', 'g1')]
  const result = buildImportVerification(
    [row('Mama Meena', '0766241854'), row('Mr & Mrs G. Msuya', '0766241854', 2)],
    roster,
  )
  assert.equal(result.matched, 1)
  const msuya = result.rows[1]
  assert.equal(msuya.verdict, 'differs')
  assert.match(msuya.detail, /stored against "Mama Meena"/)
})

test('a guest stored under a different number is caught', () => {
  // Exactly the live Robert Munisi situation: the file says one number, the
  // roster holds another because someone edited it by hand.
  const roster = [rosterGuest('Robert Munisi', '255767888999', 'g1')]
  const result = buildImportVerification([row('Robert Munisi', '0757200767', 2)], roster)
  assert.equal(result.rows[0].verdict, 'differs')
  assert.match(result.rows[0].detail, /different number: 255767888999/)
})

test('a guest lost entirely is reported as not on the list', () => {
  const result = buildImportVerification([row('Tumaini Kimambo', '0755000111')], [])
  assert.equal(result.rows[0].verdict, 'missing')
  assert.match(result.rows[0].detail, /Not on the guest list/)
})

test('a file row with no number reconciles by name', () => {
  const roster = [rosterGuest('Familia Aden', null, 'g1')]
  const result = buildImportVerification([row('Familia Aden', null)], roster)
  assert.equal(result.rows[0].verdict, 'matched')
  assert.match(result.rows[0].detail, /Still has no phone number/)
})

test('a numberless file row that has since gained a number says so', () => {
  const roster = [rosterGuest('Mama Meena', '0766241854', 'g1')]
  const result = buildImportVerification([row('Mama Meena', null)], roster)
  assert.equal(result.rows[0].verdict, 'matched')
  assert.match(result.rows[0].detail, /now has a number/)
})

test('titles do not make a stored guest look different', () => {
  const roster = [rosterGuest('Mr & Mrs G. Msuya', '0766241854', 'g1')]
  const result = buildImportVerification([row('Mr & Mrs G Msuya', '0766241854', 2)], roster)
  assert.equal(result.rows[0].verdict, 'matched')
})

test('every file row lands in exactly one bucket', () => {
  const roster = [rosterGuest('Joyce Nkembo', '0784310065', 'g1')]
  const result = buildImportVerification(MOSES_SEETA, roster)
  assert.equal(result.matched + result.differs + result.missing, MOSES_SEETA.length)
  assert.equal(result.rows.length, MOSES_SEETA.length)
})
