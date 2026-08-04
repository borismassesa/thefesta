import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildScopeIdentity,
  canonicalPeriodBounds,
  decimalString,
  optionalDecimalString,
  validateCalculationKey,
  validateDeclarativeFormulaConfig,
  validateMetricSource,
  validateTargetValues,
} from './foundations/validators'
import { calculateGrowthKpiStatus } from './foundations/status-engine'
import {
  GrowthFoundationsUnavailableError,
  isGrowthFoundationsUnavailableError,
  isMissingGrowthFoundationRelation,
} from './_lib/foundation-availability'

const repoRoot = new URL('../../../../../../', import.meta.url)
const migration = readFileSync(
  new URL('supabase/migrations/20260802025720_growth_phase1a_foundations.sql', repoRoot),
  'utf8',
)
const servicesSource = readFileSync(new URL('foundations/services.ts', import.meta.url), 'utf8')
const actionsSource = readFileSync(new URL('foundations/actions.ts', import.meta.url), 'utf8')
const permissionCatalogSource = readFileSync(
  new URL('../../../lib/workforce/permissions.ts', import.meta.url),
  'utf8',
)
const workforceTypesSource = readFileSync(new URL('../workforce/_lib/types.ts', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('../../../components/Sidebar.tsx', import.meta.url), 'utf8')

const PHASE1A_TABLES = [
  'growth_business_units',
  'growth_periods',
  'growth_metric_definitions',
  'growth_metric_targets',
  'growth_metric_actuals',
  'growth_metric_target_events',
] as const

const LEGACY_GROWTH_TABLES = [
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

describe('Growth Phase 1A migration schema contract', () => {
  it('creates the limited canonical foundation tables and leaves legacy Growth tables untouched', () => {
    for (const table of PHASE1A_TABLES) {
      assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`), `${table} is missing`)
    }
    for (const table of LEGACY_GROWTH_TABLES) {
      assert.doesNotMatch(migration, new RegExp(`\\bALTER\\s+TABLE\\s+public\\.${table}\\b`, 'i'), `${table} should not be destructively changed`)
      assert.doesNotMatch(migration, new RegExp(`\\bDROP\\s+TABLE\\s+(?:IF EXISTS\\s+)?public\\.${table}\\b`, 'i'), `${table} should not be dropped`)
    }
  })

  it('seeds configurable business units idempotently without enum locking future additions', () => {
    assert.match(migration, /INSERT INTO public\.growth_business_units/)
    for (const code of ['OPUSFESTA', 'OPUSPASS', 'OPUSSTUDIO']) {
      assert.match(migration, new RegExp(`'${code}'`), `${code} seed missing`)
    }
    assert.match(migration, /ON CONFLICT \(organization_key, code\) DO UPDATE/)
    assert.doesNotMatch(migration, /CREATE\s+TYPE\s+.*business.*unit/i)
  })

  it('uses normalized scope identities instead of unsafe nullable unique indexes', () => {
    assert.match(migration, /scope_identity text GENERATED ALWAYS AS/)
    assert.match(migration, /growth_metric_targets_current_approved_scope_idx/)
    assert.match(migration, /growth_metric_actuals_current_identity_idx/)
    assert.doesNotMatch(migration, /UNIQUE\s*\([^)]*business_unit_id[^)]*department[^)]*employee_id[^)]*\)/i)
  })

  it('enforces target lifecycle invariants in the database', () => {
    assert.match(migration, /growth_metric_targets_current_status/)
    assert.match(migration, /growth_metric_targets_archived_current/)
    assert.match(migration, /Approved Growth targets are immutable; create a revision instead/)
    for (const field of [
      'metric_definition_id',
      'period_id',
      'business_unit_id',
      'department',
      'employee_id',
      'target_value',
      'lower_bound',
      'upper_bound',
      'owner_employee_id',
      'effective_from',
      'effective_to',
      'revision_number',
      'revision_reason',
    ]) {
      assert.match(migration, new RegExp(`OLD\\.${field} IS DISTINCT FROM NEW\\.${field}`), `${field} immutability is not checked`)
    }
    assert.match(migration, /FOR UPDATE[\s\S]*status = 'superseded'[\s\S]*status = 'approved'/)
  })

  it('records domain target history while using audit_log for security-sensitive events', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.growth_metric_target_events/)
    assert.match(migration, /INSERT INTO public\.audit_log/)
    assert.doesNotMatch(migration, /growth_audit_events/)
    assert.doesNotMatch(migration, /raw_request|request_payload|secret|password/i)
  })

  it('denies direct authenticated access and grants service-role-only mutations/functions', () => {
    for (const table of PHASE1A_TABLES) {
      assert.match(migration, new RegExp(`'${table}'`), `${table} missing from RLS/grant loop`)
    }
    assert.doesNotMatch(migration, /\bCREATE\s+POLICY\b/i)
    assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM anon, authenticated/)
    assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.%I TO service_role/)
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.growth_metric_target_approve/)
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.growth_metric_target_approve/)
  })

  it('maps legacy Growth permissions without broadening ordinary writers into approvers or settings managers', () => {
    assert.match(migration, /pg_temp\.growth_add_role_keys\(\s*'growth\.admin'/)
    assert.match(migration, /pg_temp\.growth_add_role_keys\(\s*'growth\.write'/)
    assert.match(migration, /'growth\.kpi\.approve'/)
    assert.match(migration, /'growth\.settings\.manage'/)
    assert.match(migration, /growth\.write compatibility mapping granted privileged Growth permissions/)
    assert.doesNotMatch(migration, /workforce\.write[\s\S]{0,200}growth\.kpi\.approve/)
  })
})

describe('Growth Phase 1A permission catalog and route wiring', () => {
  it('adds explicit permission keys to the auth and Workforce role catalogs', () => {
    for (const key of [
      'growth.read',
      'growth.kpi.read',
      'growth.kpi.manage',
      'growth.kpi.approve',
      'growth.actual.enter',
      'growth.actual.override',
      'growth.period.manage',
      'growth.settings.manage',
    ]) {
      assert.match(
        permissionCatalogSource,
        new RegExp(`'${key}'`),
        `${key} missing from the canonical permission catalog`,
      )
      assert.match(workforceTypesSource, new RegExp(`key: '${key}'`), `${key} missing from Workforce role catalog`)
    }
  })

  it('adds only Phase 1A routes to existing Growth navigation', () => {
    assert.match(sidebarSource, /href: "\/growth\/kpis"/)
    assert.match(sidebarSource, /href: "\/growth\/settings\/business-units"/)
    assert.match(sidebarSource, /href: "\/growth\/settings\/periods"/)
    assert.doesNotMatch(sidebarSource, /\/growth\/sales-pipeline|\/growth\/reports|\/growth\/campaigns-v2/)
  })

  it('keeps mutations in server actions and services with audited permission checks', () => {
    assert.match(actionsSource, /'use server'/)
    assert.doesNotMatch(actionsSource, /\.from\(/)
    for (const permission of [
      'growth.kpi.manage',
      'growth.kpi.approve',
      'growth.actual.enter',
      'growth.actual.override',
      'growth.period.manage',
      'growth.settings.manage',
    ]) {
      assert.match(servicesSource, new RegExp(`'${permission}'`), `${permission} is not enforced in services`)
    }
    assert.match(servicesSource, /requireAnyGrowthPermission/)
    assert.match(servicesSource, /recordAuditEvent/)
    assert.match(servicesSource, /\.select\('id'\)[\s\S]{0,80}\.maybeSingle<\{ id: string \}>/)
  })
})

describe('Growth Phase 1A deployment availability', () => {
  it('recognizes only missing-relation database errors as an unavailable foundation', () => {
    assert.equal(isMissingGrowthFoundationRelation({ code: 'PGRST205' }), true)
    assert.equal(isMissingGrowthFoundationRelation({ code: '42P01' }), true)
    assert.equal(isMissingGrowthFoundationRelation({ code: '42501' }), false)
    assert.equal(isMissingGrowthFoundationRelation({ code: '23505' }), false)
    assert.equal(isMissingGrowthFoundationRelation(null), false)
  })

  it('does not mistake ordinary database errors for the typed unavailable state', () => {
    assert.equal(isGrowthFoundationsUnavailableError(new GrowthFoundationsUnavailableError()), true)
    assert.equal(isGrowthFoundationsUnavailableError(new Error('Could not load Growth data.')), false)
  })
})

describe('Growth Phase 1A validators', () => {
  it('builds stable normalized scope identity for nullable dimensions', () => {
    assert.equal(buildScopeIdentity({ businessUnitId: null, department: null, employeeId: null }), 'bu=org|dept=org|emp=org')
    assert.equal(
      buildScopeIdentity({ businessUnitId: 'bu-1', department: 'Studio', employeeId: 'emp-1' }),
      'bu=bu-1|dept=Studio|emp=emp-1',
    )
  })

  it('accepts large fixed decimal strings and rejects NaN/Infinity/floats outside the contract', () => {
    assert.deepEqual(decimalString('99999999999999999999.1234567890', 'TZS'), { ok: true, value: '99999999999999999999.1234567890' })
    assert.equal(optionalDecimalString('', 'optional').ok, true)
    assert.equal(decimalString('NaN', 'value').ok, false)
    assert.equal(decimalString('Infinity', 'value').ok, false)
    assert.equal(decimalString('1.12345678901', 'value').ok, false)
  })

  it('derives exact exclusive calendar period bounds', () => {
    assert.deepEqual(canonicalPeriodBounds('month', '2024-02-01'), {
      ok: true,
      value: { startDate: '2024-02-01', endDate: '2024-03-01', fiscalYear: 2024, fiscalQuarter: null, label: 'February 2024' },
    })
    assert.deepEqual(canonicalPeriodBounds('month', '2026-12-01'), {
      ok: true,
      value: { startDate: '2026-12-01', endDate: '2027-01-01', fiscalYear: 2026, fiscalQuarter: null, label: 'December 2026' },
    })
    assert.deepEqual(canonicalPeriodBounds('quarter', '2026-04-01'), {
      ok: true,
      value: { startDate: '2026-04-01', endDate: '2026-07-01', fiscalYear: 2026, fiscalQuarter: 2, label: 'Q2 2026' },
    })
    assert.equal(canonicalPeriodBounds('quarter', '2026-02-01').ok, false)
    assert.equal(canonicalPeriodBounds('year', '2026-02-01').ok, false)
  })

  it('rejects executable formula metadata and unsafe calculated metric declarations', () => {
    assert.equal(validateDeclarativeFormulaConfig('{"sql":"select 1"}').ok, false)
    assert.deepEqual(validateDeclarativeFormulaConfig('{"weight":"bookings"}'), { ok: true, value: { weight: 'bookings' } })
    assert.equal(validateCalculationKey('growth.monthly_revenue', 'Calculation key').ok, true)
    assert.equal(validateCalculationKey('SELECT * FROM x', 'Calculation key').ok, false)
    assert.equal(validateMetricSource('calculated', 'sum', null, null).ok, false)
    assert.equal(validateMetricSource('calculated', 'formula', 'growth.monthly_revenue', null).ok, true)
  })

  it('validates target-range and non-range target requirements', () => {
    assert.equal(validateTargetValues('target_range', null, '10', '20').ok, true)
    assert.equal(validateTargetValues('target_range', null, '30', '20').ok, false)
    assert.equal(validateTargetValues('higher_is_better', null, null, null).ok, false)
    assert.equal(validateTargetValues('lower_is_better', '100', null, null).ok, true)
  })
})

describe('Growth Phase 1A KPI status engine', () => {
  it('handles higher-is-better progress using the linear period model', () => {
    const result = calculateGrowthKpiStatus({
      direction: 'higher_is_better',
      targetValue: '100',
      currentActual: '60',
      periodStart: '2026-08-01',
      periodEndExclusive: '2026-08-31',
      asOfDate: '2026-08-15',
    })
    assert.equal(result.status, 'ahead')
    assert.equal(result.forecastConfidence, 'linear')
  })

  it('does not use naive actual/target health for lower-is-better metrics', () => {
    const result = calculateGrowthKpiStatus({
      direction: 'lower_is_better',
      targetValue: '100',
      currentActual: '40',
      periodStart: '2026-08-01',
      periodEndExclusive: '2026-08-31',
      asOfDate: '2026-08-15',
    })
    assert.equal(result.status, 'on_track')
    assert.ok((result.variance ?? 0) > 0)
  })

  it('handles target ranges without forecasting', () => {
    const result = calculateGrowthKpiStatus({
      direction: 'target_range',
      lowerBound: '80',
      upperBound: '95',
      currentActual: '90',
      periodStart: '2026-08-01',
      periodEndExclusive: '2026-09-01',
      asOfDate: '2026-08-20',
    })
    assert.equal(result.status, 'on_track')
    assert.equal(result.forecast, null)
    assert.equal(result.forecastConfidence, 'unavailable')
  })

  it('returns explicit unavailable states for no data, not-started, blocked, completed and zero target cases', () => {
    const base = {
      targetValue: '100',
      periodStart: '2026-08-01',
      periodEndExclusive: '2026-09-01',
      asOfDate: '2026-08-10',
    } as const
    assert.equal(calculateGrowthKpiStatus({ ...base, direction: 'higher_is_better' }).status, 'no_data')
    assert.equal(calculateGrowthKpiStatus({ ...base, direction: 'higher_is_better', currentActual: '1', asOfDate: '2026-07-31' }).status, 'not_started')
    assert.equal(calculateGrowthKpiStatus({ ...base, direction: 'higher_is_better', currentActual: '1', blocked: true }).status, 'blocked')
    assert.equal(calculateGrowthKpiStatus({ ...base, direction: 'higher_is_better', currentActual: '100', completed: true }).status, 'completed')
    assert.equal(calculateGrowthKpiStatus({ ...base, direction: 'higher_is_better', targetValue: '0', currentActual: '0' }).status, 'on_track')
  })

  it('treats the exclusive period end as fully elapsed', () => {
    const result = calculateGrowthKpiStatus({
      direction: 'higher_is_better',
      targetValue: '100',
      currentActual: '100',
      periodStart: '2026-08-01',
      periodEndExclusive: '2026-09-01',
      asOfDate: '2026-09-01',
    })
    assert.equal(result.expectedProgress, 1)
    assert.equal(result.status, 'on_track')
  })
})
