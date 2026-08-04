/**
 * Regenerates the database half of the phone-normalization parity gate from
 * the shared fixture, so both halves can never test different cases.
 *
 *   npx tsx scripts/preflight/generate-phone-parity-sql.ts
 *
 * The committed output is held in step by a test, so forgetting to run this
 * fails the build rather than silently shrinking the gate.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderPhoneParitySql } from '../../packages/lib/phone-normalization-fixtures'

const OUTPUT = join(__dirname, 'guest-phone-normalization-parity.sql')

writeFileSync(OUTPUT, renderPhoneParitySql(), 'utf8')
console.log(`Wrote ${OUTPUT}`)
