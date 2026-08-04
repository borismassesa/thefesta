import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
// Imported by path, not as '@opusfesta/lib'. A git worktree symlinks
// node_modules at the main checkout, so the barrel would resolve to the OTHER
// checkout's packages/lib and silently test a different fixture (or none).
// The fixture is also test data, so it deliberately stays out of the barrel
// that every app bundles.
import {
  PHONE_NORMALIZATION_CASES,
  renderPhoneParitySql,
} from '../../../../../packages/lib/phone-normalization-fixtures'
import { normalizePhone } from './share'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const GENERATED_SQL = join(REPO_ROOT, 'scripts', 'preflight', 'guest-phone-normalization-parity.sql')

/**
 * Half of the parity gate. This side proves the TypeScript implementation
 * matches the fixture; the generated SQL script proves the database function
 * matches the SAME fixture when run against a real Postgres.
 *
 * Both halves are required. A test that only exercises TypeScript cannot
 * detect drift in the function that actually backs the unique index, and
 * re-implementing the SQL in TypeScript to "check" it would only assert that
 * one reading of the SQL matches another.
 */
test('normalizePhone matches the shared fixture on every case', () => {
  const mismatches: string[] = []

  for (const { input, expected, why } of PHONE_NORMALIZATION_CASES) {
    const actual = normalizePhone(input)
    if (actual !== expected) {
      mismatches.push(
        [
          `  input:    ${JSON.stringify(input)}   (${why})`,
          `  expected: ${JSON.stringify(expected)}`,
          `  actual:   ${JSON.stringify(actual)}`,
        ].join('\n')
      )
    }
  }

  assert.equal(
    mismatches.length,
    0,
    `\n\nPhone normalization mismatch in ${mismatches.length} of ${PHONE_NORMALIZATION_CASES.length} cases:\n\n` +
      `${mismatches.join('\n\n')}\n\n` +
      'normalizePhone() and public.opuspass_normalize_phone() must agree exactly.\n' +
      'The SQL one backs the "one number, one guest" unique index; if they\n' +
      'disagree, the app clears a guest the index then rejects.\n'
  )
})

test('every fixture input is distinct', () => {
  const seen = new Set<string>()
  for (const { input } of PHONE_NORMALIZATION_CASES) {
    const key = JSON.stringify(input)
    assert.ok(!seen.has(key), `Duplicate fixture input ${key} — one case per input.`)
    seen.add(key)
  }
})

/**
 * The committed SQL script is generated from the fixture. Without this check
 * a case added here would silently never reach the database side of the gate,
 * which is the half that guards the index.
 */
test('the generated parity SQL is up to date with the fixture', () => {
  const committed = readFileSync(GENERATED_SQL, 'utf8')
  assert.equal(
    committed,
    renderPhoneParitySql(),
    '\n\nscripts/preflight/guest-phone-normalization-parity.sql is stale.\n' +
      'Regenerate it:\n\n' +
      '  npx tsx scripts/preflight/generate-phone-parity-sql.ts\n'
  )
})
