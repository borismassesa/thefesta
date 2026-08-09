import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260802090711_recruitment_platform_domain.sql'),
  'utf8',
)
const hardeningMigration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260809031358_recruitment_e2e_hardening.sql'),
  'utf8',
)

describe('legacy recruitment compatibility sync', () => {
  it('does not regress canonical workflow state during contact updates or migration reruns', () => {
    assert.match(migration, /v_sync_status := NEW\.stage IS DISTINCT FROM OLD\.stage/)
    assert.match(
      migration,
      /status = CASE\s+WHEN v_sync_status THEN EXCLUDED\.status\s+ELSE recruitment_applications\.status\s+END/,
    )
    assert.match(
      migration,
      /candidate_facing_status = CASE\s+WHEN v_sync_status THEN EXCLUDED\.candidate_facing_status\s+ELSE recruitment_applications\.candidate_facing_status\s+END/,
    )
  })

  it('ships the replay fix in a forward migration for deployed environments', () => {
    assert.match(hardeningMigration, /v_sync_status := NEW\.stage IS DISTINCT FROM OLD\.stage/)
    assert.match(
      hardeningMigration,
      /status = CASE\s+WHEN v_sync_status THEN EXCLUDED\.status\s+ELSE recruitment_applications\.status\s+END/,
    )
  })

  it('reconciles the reference-check columns required by the admin record page', () => {
    for (const column of [
      'candidate_consent_at',
      'access_token_hash',
      'access_expires_at',
    ]) {
      assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`))
      assert.match(hardeningMigration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`))
    }
  })

  it('aligns the private Careers bucket with the public 10 MB upload contract', () => {
    assert.match(
      hardeningMigration,
      /VALUES\s*\(\s*'careers',\s*'careers',\s*false,\s*10485760,/,
    )
  })
})
