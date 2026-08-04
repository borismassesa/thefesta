import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, it } from 'node:test'
import { dateIsInHalfOpenMonth, monthBounds, nextMonthKey } from './_lib/period'
import { nullableTrimmedText } from './_lib/text'

const growthDir = new URL('.', import.meta.url)
const migrationsDir = new URL('../../../../../../supabase/migrations/', import.meta.url)
const phase0Migration = readFileSync(
  new URL('20260802021142_growth_tracker_phase0_stabilization.sql', migrationsDir),
  'utf8',
)

const ACTION_FILES = [
  'actions.ts',
  'vendor-outreach/actions.ts',
  'marketing/actions.ts',
  'social/actions.ts',
  'studio/actions.ts',
  'content-ideas/actions.ts',
] as const

const AFFECTED_ROW_FUNCTIONS = [
  ['actions.ts', 'updateKpiTarget'],
  ['vendor-outreach/actions.ts', 'saveOutreachTarget'],
  ['vendor-outreach/actions.ts', 'updateOutreachLogEntry'],
  ['vendor-outreach/actions.ts', 'deleteOutreachLogEntry'],
  ['marketing/actions.ts', 'updateCampaign'],
  ['marketing/actions.ts', 'deleteCampaign'],
  ['social/actions.ts', 'updateContentPost'],
  ['social/actions.ts', 'deleteContentPost'],
  ['social/actions.ts', 'updateChallengeDefinition'],
  ['social/actions.ts', 'updateChallengeResults'],
  ['social/actions.ts', 'deleteChallenge'],
  ['studio/actions.ts', 'updateBooking'],
  ['studio/actions.ts', 'deleteBooking'],
  ['content-ideas/actions.ts', 'updateContentIdea'],
  ['content-ideas/actions.ts', 'deleteContentIdea'],
] as const

const GROWTH_TABLES = [
  'growth_kpi_targets',
  'growth_kpi_actuals',
  'growth_vendor_outreach_targets',
  'growth_vendor_outreach_log',
  'growth_marketing_campaigns',
  'growth_social_content_log',
  'growth_social_challenges',
  'growth_studio_bookings_log',
  'growth_content_ideas',
] as const

function readGrowthFile(path: string): string {
  return readFileSync(new URL(path, growthDir), 'utf8')
}

function functionSource(fileSource: string, functionName: string): string {
  const start = fileSource.indexOf(`export async function ${functionName}`)
  assert.notEqual(start, -1, `${functionName} not found`)
  const next = fileSource.indexOf('\nexport async function ', start + 1)
  return fileSource.slice(start, next === -1 ? undefined : next)
}

function allGrowthSourceFiles(dirUrl: URL): string[] {
  const dirPath = dirUrl.pathname
  return readdirSync(dirPath).flatMap((entry) => {
    const fullPath = join(dirPath, entry)
    if (statSync(fullPath).isDirectory()) return allGrowthSourceFiles(new URL(`${entry}/`, dirUrl))
    if (!/\.(ts|tsx)$/.test(entry) || entry.endsWith('.test.ts')) return []
    return [readFileSync(fullPath, 'utf8')]
  })
}

describe('Growth dashboard month bounds', () => {
  it('uses a half-open range for a normal month', () => {
    const bounds = monthBounds('2026-08-01')
    assert.deepEqual(bounds, { start: '2026-08-01', next: '2026-09-01' })
    assert.equal(dateIsInHalfOpenMonth('2026-07-31', bounds), false)
    assert.equal(dateIsInHalfOpenMonth('2026-08-01', bounds), true)
    assert.equal(dateIsInHalfOpenMonth('2026-08-31', bounds), true)
    assert.equal(dateIsInHalfOpenMonth('2026-09-01', bounds), false)
  })

  it('handles December rollover and leap-year February without date math drift', () => {
    assert.equal(nextMonthKey('2026-12-01'), '2027-01-01')
    assert.equal(nextMonthKey('2024-02-01'), '2024-03-01')
    assert.equal(dateIsInHalfOpenMonth('2024-02-29', monthBounds('2024-02-01')), true)
  })
})

describe('Growth nullable text normalization', () => {
  it('maps absent optional text to null and preserves real text', () => {
    assert.equal(nullableTrimmedText(null), null)
    assert.equal(nullableTrimmedText(undefined), null)
    assert.equal(nullableTrimmedText('   '), null)
    assert.equal(nullableTrimmedText('  Studio Lead  '), 'Studio Lead')
  })
})

describe('Growth server actions are permissioned, sanitized and race-aware', () => {
  it('write actions use the audited Growth permission helper instead of hasPermission', () => {
    for (const file of ACTION_FILES) {
      const src = readGrowthFile(file)
      assert.doesNotMatch(src, /\bhasPermission\(/, `${file} uses unaudited hasPermission in a server action`)
      assert.match(src, /\brequireGrowthPermission\(/, `${file} does not call the Growth permission gate`)
    }
  })

  it('Growth source no longer exposes raw Supabase error details', () => {
    for (const [index, src] of allGrowthSourceFiles(growthDir).entries()) {
      assert.doesNotMatch(src, /\b\w*Error\.(message|details|hint)\b/, `Growth source #${index} exposes raw DB errors`)
      assert.doesNotMatch(src, /console\.error\([^)]*\berror\b/, `Growth source #${index} logs raw errors`)
    }
  })

  it('every Growth update/delete action verifies the affected row', () => {
    for (const [file, functionName] of AFFECTED_ROW_FUNCTIONS) {
      const body = functionSource(readGrowthFile(file), functionName)
      assert.match(body, /\.(update|delete)\(/, `${file}:${functionName} is not an update/delete`)
      assert.match(body, /\.select\('id'\)/, `${file}:${functionName} does not select the affected id`)
      assert.match(body, /\.maybeSingle<\{ id: string \}>/, `${file}:${functionName} does not collapse to one affected row`)
      assert.match(body, /if \(!data\) return missingGrowthRecord\(\)/, `${file}:${functionName} lacks stale-row handling`)
    }
  })
})

describe('Growth Phase 0 migration', () => {
  it('makes only the confirmed optional text fields nullable and default-null', () => {
    assert.match(phase0Migration, /UPDATE public\.growth_marketing_campaigns\s+SET notes = NULL\s+WHERE notes = '';/)
    assert.match(
      phase0Migration,
      /ALTER TABLE public\.growth_marketing_campaigns[\s\S]*ALTER COLUMN notes DROP DEFAULT[\s\S]*ALTER COLUMN notes DROP NOT NULL;/,
    )

    for (const column of ['photographer_name', 'videographer_name', 'notes']) {
      assert.match(
        phase0Migration,
        new RegExp(`UPDATE public\\.growth_studio_bookings_log\\s+SET ${column} = NULL\\s+WHERE ${column} = '';`),
      )
      assert.match(phase0Migration, new RegExp(`ALTER COLUMN ${column} DROP DEFAULT[\\s\\S]*ALTER COLUMN ${column} DROP NOT NULL`))
    }
  })

  it('removes broad authenticated Growth RLS policies without creating replacement direct-client policies', () => {
    assert.doesNotMatch(phase0Migration, /\bCREATE\s+POLICY\b/, 'Phase 0 should deny direct anon/authenticated access')
    assert.doesNotMatch(phase0Migration, /\bCREATE\s+POLICY[\s\S]{0,300}\bTO\s+authenticated\b/)
    assert.match(phase0Migration, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/)
    assert.match(phase0Migration, /DROP POLICY IF EXISTS "%1\$s_read" ON public\.%1\$I/)
    assert.match(phase0Migration, /DROP POLICY IF EXISTS "%1\$s_write" ON public\.%1\$I/)

    for (const table of GROWTH_TABLES) {
      assert.match(phase0Migration, new RegExp(`'${table}'`), `${table} is missing from the Growth RLS table list`)
    }
  })

  it('does not introduce a new SQL permission helper for Growth RLS', () => {
    const executableSql = phase0Migration
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')

    assert.doesNotMatch(executableSql, /\bis_workforce_(reader|admin)\s*\(/)
    assert.doesNotMatch(executableSql, /\bworkforce_permissions_for_employee\s*\(/)
    assert.equal(basename(new URL('20260701000005_growth_tracker.sql', migrationsDir).pathname), '20260701000005_growth_tracker.sql')
  })
})
