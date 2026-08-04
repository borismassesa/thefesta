import 'server-only'

import { revalidatePath } from 'next/cache'
import { escapeLike, getCallerEmail } from '@/lib/admin-auth'
import { recordAuditEvent } from '@/lib/audit-log'
import { dbErrorCode } from '@/lib/log-safe'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  GROWTH_ERROR,
  growthDbErrorMessage,
  logGrowthDbError,
  requireAnyGrowthPermission,
  type ActionResult,
} from '../_lib/action-utils'
import type {
  DecimalString,
  GrowthActualOrigin,
  GrowthAggregationMethod,
  GrowthMeasurementUnit,
  GrowthMetricDirection,
  GrowthPeriodStatus,
  GrowthPeriodType,
  GrowthReviewFrequency,
  GrowthScope,
  GrowthSourceMode,
  GrowthValueType,
} from './types'
import {
  DEFAULT_ORGANIZATION_KEY,
  buildScopeIdentity,
  canonicalPeriodBounds,
  decimalString,
  nonEmptyText,
  normalizeBusinessUnitCode,
  normalizeCurrencyCode,
  normalizeOptionalText,
  optionalDecimalString,
  parseDepartment,
  uuidOrNull,
  validateCalculationKey,
  validateDeclarativeFormulaConfig,
  validateMetricSource,
  validateTargetValues,
} from './validators'

type DataResult<T> = { ok: true; data: T } | { ok: false; error: string }

const KPI_READ_PERMISSIONS = ['growth.kpi.read', 'growth.read', 'growth.write', 'growth.admin'] as const
const KPI_MANAGE_PERMISSIONS = ['growth.kpi.manage', 'growth.admin'] as const
const KPI_APPROVE_PERMISSIONS = ['growth.kpi.approve', 'growth.admin'] as const
const ACTUAL_ENTER_PERMISSIONS = ['growth.actual.enter', 'growth.admin'] as const
const ACTUAL_OVERRIDE_PERMISSIONS = ['growth.actual.override', 'growth.admin'] as const
const PERIOD_MANAGE_PERMISSIONS = ['growth.period.manage', 'growth.admin'] as const
const SETTINGS_MANAGE_PERMISSIONS = ['growth.settings.manage', 'growth.admin'] as const

export async function requireGrowthKpiRead(): Promise<ActionResult | null> {
  return requireAnyGrowthPermission(KPI_READ_PERMISSIONS)
}

async function currentEmployeeId(): Promise<string | null> {
  const email = await getCallerEmail()
  if (!email) return null
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id')
    .ilike('email', escapeLike(email))
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.actor_employee.select', error)
    return null
  }
  return data?.id ?? null
}

function revalidateGrowthFoundations(): void {
  revalidatePath('/growth/kpis')
  revalidatePath('/growth/settings/business-units')
  revalidatePath('/growth/settings/periods')
}

async function auditGrowthMutation(eventType: string, targetResource: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await recordAuditEvent({
    eventType,
    severity: 'info',
    message: eventType.replaceAll('.', ' '),
    targetResource,
    metadata,
  })
}

export async function createBusinessUnit(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(SETTINGS_MANAGE_PERMISSIONS)
  if (denied) return denied

  const code = normalizeBusinessUnitCode(String(formData.get('code') ?? ''))
  if (!code.ok) return { ok: false, error: code.error }
  const name = nonEmptyText(formData.get('name'), 'Name')
  if (!name.ok) return name
  const currency = normalizeCurrencyCode(String(formData.get('defaultCurrencyCode') ?? 'TZS'))
  if (!currency.ok) return { ok: false, error: currency.error }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_business_units')
    .insert({
      organization_key: DEFAULT_ORGANIZATION_KEY,
      code: code.value,
      name: name.value,
      description: normalizeOptionalText(formData.get('description')) ?? '',
      default_currency_code: currency.value,
      display_order: Number(formData.get('displayOrder') ?? 0) || 0,
    })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.business_units.insert', error)
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return { ok: false, error: GROWTH_ERROR.save }
  await auditGrowthMutation('growth.business_unit_created', `growth_business_units:${data.id}`, { businessUnitId: data.id })
  revalidateGrowthFoundations()
  return { ok: true }
}

export async function updateBusinessUnit(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(SETTINGS_MANAGE_PERMISSIONS)
  if (denied) return denied

  const id = uuidOrNull(formData.get('id'))
  if (!id) return { ok: false, error: GROWTH_ERROR.stale }
  const name = nonEmptyText(formData.get('name'), 'Name')
  if (!name.ok) return name
  const currency = normalizeCurrencyCode(String(formData.get('defaultCurrencyCode') ?? 'TZS'))
  if (!currency.ok) return { ok: false, error: currency.error }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_business_units')
    .update({
      name: name.value,
      description: normalizeOptionalText(formData.get('description')) ?? '',
      default_currency_code: currency.value,
      is_active: formData.get('isActive') === 'on',
      display_order: Number(formData.get('displayOrder') ?? 0) || 0,
    })
    .eq('id', id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.business_units.update', error, { id })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return { ok: false, error: GROWTH_ERROR.stale }
  await auditGrowthMutation('growth.business_unit_updated', `growth_business_units:${id}`, { businessUnitId: id })
  revalidateGrowthFoundations()
  return { ok: true }
}

export async function archiveBusinessUnit(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(SETTINGS_MANAGE_PERMISSIONS)
  if (denied) return denied
  const id = uuidOrNull(formData.get('id'))
  if (!id) return { ok: false, error: GROWTH_ERROR.stale }
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_business_units')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.business_units.archive', error, { id })
    return { ok: false, error: GROWTH_ERROR.save }
  }
  if (!data) return { ok: false, error: GROWTH_ERROR.stale }
  await auditGrowthMutation('growth.business_unit_archived', `growth_business_units:${id}`, { businessUnitId: id })
  revalidateGrowthFoundations()
  return { ok: true }
}

export async function createCanonicalPeriod(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(PERIOD_MANAGE_PERMISSIONS)
  if (denied) return denied
  const periodType = String(formData.get('periodType') ?? 'month') as GrowthPeriodType
  if (!['month', 'quarter', 'year'].includes(periodType)) return { ok: false, error: 'Period type is invalid.' }
  const bounds = canonicalPeriodBounds(periodType, String(formData.get('startDate') ?? ''))
  if (!bounds.ok) return { ok: false, error: bounds.error }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_periods')
    .insert({
      organization_key: DEFAULT_ORGANIZATION_KEY,
      period_type: periodType,
      start_date: bounds.value.startDate,
      end_date: bounds.value.endDate,
      label: normalizeOptionalText(formData.get('label')) ?? bounds.value.label,
      fiscal_year: bounds.value.fiscalYear,
      fiscal_quarter: bounds.value.fiscalQuarter,
    })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.periods.insert', error)
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return { ok: false, error: GROWTH_ERROR.save }
  await auditGrowthMutation('growth.period_created', `growth_periods:${data.id}`, { periodId: data.id, periodType })
  revalidateGrowthFoundations()
  return { ok: true }
}

export async function setPeriodStatus(formData: FormData, status: Exclude<GrowthPeriodStatus, 'open'>): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(PERIOD_MANAGE_PERMISSIONS)
  if (denied) return denied
  const id = uuidOrNull(formData.get('id'))
  if (!id) return { ok: false, error: GROWTH_ERROR.stale }
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_periods')
    .update({ status })
    .eq('id', id)
    .neq('status', 'closed')
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.periods.status', error, { id })
    return { ok: false, error: GROWTH_ERROR.save }
  }
  if (!data) return { ok: false, error: 'The Growth period is closed or no longer exists.' }
  await auditGrowthMutation(`growth.period_${status}`, `growth_periods:${id}`, { periodId: id })
  revalidateGrowthFoundations()
  return { ok: true }
}

export async function createMetricDefinition(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(KPI_MANAGE_PERMISSIONS)
  if (denied) return denied

  const code = normalizeBusinessUnitCode(String(formData.get('code') ?? ''))
  if (!code.ok) return { ok: false, error: code.error }
  const name = nonEmptyText(formData.get('name'), 'Name')
  if (!name.ok) return name
  const department = parseDepartment(formData.get('department'))
  if (!department.ok) return { ok: false, error: department.error }
  const currency = normalizeCurrencyCode(String(formData.get('defaultCurrencyCode') ?? 'TZS'))
  if (!currency.ok) return { ok: false, error: currency.error }
  const calculationKey = validateCalculationKey(normalizeOptionalText(formData.get('calculationKey')), 'Calculation key')
  if (!calculationKey.ok) return { ok: false, error: calculationKey.error }
  const dataSourceKey = validateCalculationKey(normalizeOptionalText(formData.get('dataSourceKey')), 'Data source key')
  if (!dataSourceKey.ok) return { ok: false, error: dataSourceKey.error }
  const formulaConfig = validateDeclarativeFormulaConfig(formData.get('declarativeFormulaConfig'))
  if (!formulaConfig.ok) return { ok: false, error: formulaConfig.error }

  const sourceMode = String(formData.get('sourceMode') ?? 'manual') as GrowthSourceMode
  const aggregationMethod = String(formData.get('aggregationMethod') ?? 'sum') as GrowthAggregationMethod
  const metricSource = validateMetricSource(sourceMode, aggregationMethod, calculationKey.value, dataSourceKey.value)
  if (!metricSource.ok) return { ok: false, error: metricSource.error }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_metric_definitions')
    .insert({
      organization_key: DEFAULT_ORGANIZATION_KEY,
      code: code.value,
      name: name.value,
      description: normalizeOptionalText(formData.get('description')) ?? '',
      business_unit_id: uuidOrNull(formData.get('businessUnitId')),
      department: department.value,
      owner_employee_id: uuidOrNull(formData.get('ownerEmployeeId')),
      measurement_unit: String(formData.get('measurementUnit') ?? 'count') as GrowthMeasurementUnit,
      source_mode: sourceMode,
      direction: String(formData.get('direction') ?? 'higher_is_better') as GrowthMetricDirection,
      aggregation_method: aggregationMethod,
      value_type: String(formData.get('valueType') ?? 'decimal') as GrowthValueType,
      default_currency_code: currency.value,
      calculation_key: calculationKey.value,
      declarative_formula_config: formulaConfig.value,
      data_source_key: dataSourceKey.value,
      review_frequency: String(formData.get('reviewFrequency') ?? 'monthly') as GrowthReviewFrequency,
      evidence_required: formData.get('evidenceRequired') === 'on',
    })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.metric_definitions.insert', error)
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return { ok: false, error: GROWTH_ERROR.save }
  await auditGrowthMutation('growth.metric_definition_created', `growth_metric_definitions:${data.id}`, { metricDefinitionId: data.id })
  revalidateGrowthFoundations()
  return { ok: true }
}

export async function archiveMetricDefinition(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(KPI_MANAGE_PERMISSIONS)
  if (denied) return denied
  const id = uuidOrNull(formData.get('id'))
  const expectedLockVersion = Number(formData.get('lockVersion') ?? 0)
  if (!id || !expectedLockVersion) return { ok: false, error: GROWTH_ERROR.stale }
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_metric_definitions')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('lock_version', expectedLockVersion)
    .is('archived_at', null)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.metric_definitions.archive', error, { id })
    return { ok: false, error: GROWTH_ERROR.save }
  }
  if (!data) return { ok: false, error: GROWTH_ERROR.stale }
  await auditGrowthMutation('growth.metric_definition_archived', `growth_metric_definitions:${id}`, { metricDefinitionId: id })
  revalidateGrowthFoundations()
  return { ok: true }
}

export async function createTargetDraft(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(KPI_MANAGE_PERMISSIONS)
  if (denied) return denied
  const metricDefinitionId = uuidOrNull(formData.get('metricDefinitionId'))
  const periodId = uuidOrNull(formData.get('periodId'))
  if (!metricDefinitionId || !periodId) return { ok: false, error: 'Metric and period are required.' }
  const department = parseDepartment(formData.get('department'))
  if (!department.ok) return { ok: false, error: department.error }
  const targetValue = optionalDecimalString(formData.get('targetValue'), 'Target value')
  const lowerBound = optionalDecimalString(formData.get('lowerBound'), 'Lower bound')
  const upperBound = optionalDecimalString(formData.get('upperBound'), 'Upper bound')
  if (!targetValue.ok) return { ok: false, error: targetValue.error }
  if (!lowerBound.ok) return { ok: false, error: lowerBound.error }
  if (!upperBound.ok) return { ok: false, error: upperBound.error }
  const direction = String(formData.get('direction') ?? 'higher_is_better') as GrowthMetricDirection
  const targetCheck = validateTargetValues(direction, targetValue.value, lowerBound.value, upperBound.value)
  if (!targetCheck.ok) return { ok: false, error: targetCheck.error }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_metric_targets')
    .insert({
      organization_key: DEFAULT_ORGANIZATION_KEY,
      metric_definition_id: metricDefinitionId,
      period_id: periodId,
      business_unit_id: uuidOrNull(formData.get('businessUnitId')),
      department: department.value,
      employee_id: uuidOrNull(formData.get('employeeId')),
      target_value: targetValue.value,
      lower_bound: lowerBound.value,
      upper_bound: upperBound.value,
      status: 'draft',
      is_current: false,
      owner_employee_id: uuidOrNull(formData.get('ownerEmployeeId')),
      effective_from: String(formData.get('effectiveFrom') ?? new Date().toISOString().slice(0, 10)),
      revision_reason: normalizeOptionalText(formData.get('revisionReason')),
    })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.metric_targets.insert', error, { metricDefinitionId, periodId })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return { ok: false, error: GROWTH_ERROR.save }
  await auditGrowthMutation('growth.target_draft_created', `growth_metric_targets:${data.id}`, { targetId: data.id })
  revalidateGrowthFoundations()
  return { ok: true }
}

async function runTargetLifecycleRpc(
  formData: FormData,
  permission: readonly string[],
  rpcName: 'growth_metric_target_submit' | 'growth_metric_target_reject' | 'growth_metric_target_approve' | 'growth_metric_target_archive',
  success: string,
): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(permission)
  if (denied) return denied
  const targetId = uuidOrNull(formData.get('targetId'))
  const lockVersion = Number(formData.get('lockVersion') ?? 0)
  if (!targetId || !lockVersion) return { ok: false, error: GROWTH_ERROR.stale }
  const actorEmployeeId = await currentEmployeeId()
  if (!actorEmployeeId) return { ok: false, error: 'Your dashboard user must be linked to a Workforce employee before changing Growth target state.' }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc(rpcName, {
    p_target_id: targetId,
    p_actor_employee_id: actorEmployeeId,
    p_expected_lock_version: lockVersion,
    p_reason: normalizeOptionalText(formData.get('reason')),
  }).returns<string>()
  if (error) {
    logGrowthDbError(`growth.targets.${rpcName}`, error, { targetId })
    return { ok: false, error: GROWTH_ERROR.save }
  }
  if (data !== success) return { ok: false, error: data === 'stale' ? GROWTH_ERROR.stale : `Target transition failed: ${data}.` }
  revalidateGrowthFoundations()
  return { ok: true }
}

export function submitTarget(formData: FormData): Promise<ActionResult> {
  return runTargetLifecycleRpc(formData, KPI_MANAGE_PERMISSIONS, 'growth_metric_target_submit', 'submitted')
}

export function approveTarget(formData: FormData): Promise<ActionResult> {
  return runTargetLifecycleRpc(formData, KPI_APPROVE_PERMISSIONS, 'growth_metric_target_approve', 'approved')
}

export function rejectTarget(formData: FormData): Promise<ActionResult> {
  return runTargetLifecycleRpc(formData, KPI_APPROVE_PERMISSIONS, 'growth_metric_target_reject', 'rejected')
}

export async function createTargetRevision(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(KPI_MANAGE_PERMISSIONS)
  if (denied) return denied
  const targetId = uuidOrNull(formData.get('targetId'))
  if (!targetId) return { ok: false, error: GROWTH_ERROR.stale }
  const reason = nonEmptyText(formData.get('reason'), 'Revision reason')
  if (!reason.ok) return reason
  const actorEmployeeId = await currentEmployeeId()
  if (!actorEmployeeId) return { ok: false, error: 'Your dashboard user must be linked to a Workforce employee before revising Growth targets.' }
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('growth_metric_target_create_revision', {
    p_target_id: targetId,
    p_actor_employee_id: actorEmployeeId,
    p_revision_reason: reason.value,
  }).returns<string>()
  if (error) {
    logGrowthDbError('growth.targets.create_revision', error, { targetId })
    return { ok: false, error: GROWTH_ERROR.save }
  }
  revalidateGrowthFoundations()
  return { ok: true }
}

export async function createManualActual(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(ACTUAL_ENTER_PERMISSIONS)
  if (denied) return denied
  const metricDefinitionId = uuidOrNull(formData.get('metricDefinitionId'))
  const periodId = uuidOrNull(formData.get('periodId'))
  const asOfDate = String(formData.get('asOfDate') ?? '')
  if (!metricDefinitionId || !periodId || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) return { ok: false, error: 'Metric, period, and as-of date are required.' }
  const value = decimalString(formData.get('value'), 'Actual value')
  if (!value.ok) return { ok: false, error: value.error }
  const department = parseDepartment(formData.get('department'))
  if (!department.ok) return { ok: false, error: department.error }
  const actorEmployeeId = await currentEmployeeId()
  if (!actorEmployeeId) return { ok: false, error: 'Your dashboard user must be linked to a Workforce employee before entering Growth actuals.' }
  const scope = {
    businessUnitId: uuidOrNull(formData.get('businessUnitId')),
    department: department.value,
    employeeId: uuidOrNull(formData.get('employeeId')),
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_metric_actuals')
    .insert({
      organization_key: DEFAULT_ORGANIZATION_KEY,
      metric_definition_id: metricDefinitionId,
      period_id: periodId,
      as_of_date: asOfDate,
      business_unit_id: scope.businessUnitId,
      department: scope.department,
      employee_id: scope.employeeId,
      value: value.value,
      origin_type: 'manual_entry' satisfies GrowthActualOrigin,
      idempotency_key: `manual:${metricDefinitionId}:${periodId}:${asOfDate}:${buildScopeIdentity(scope)}`,
      entered_by_employee_id: actorEmployeeId,
    })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.metric_actuals.manual_insert', error, { metricDefinitionId, periodId })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return { ok: false, error: GROWTH_ERROR.save }
  await auditGrowthMutation('growth.actual_manual_entered', `growth_metric_actuals:${data.id}`, { actualId: data.id })
  revalidateGrowthFoundations()
  return { ok: true }
}

export async function recordCalculatedActual(input: {
  metricDefinitionId: string
  periodId: string
  asOfDate: string
  value: DecimalString
  sourceSystem: string
  calculationVersion: string
  idempotencyKey: string
  businessUnitId?: string | null
  department?: GrowthScope['department']
  employeeId?: string | null
}): Promise<DataResult<string>> {
  const denied = await requireAnyGrowthPermission(KPI_MANAGE_PERMISSIONS)
  if (denied && !denied.ok) return denied
  if (denied) return { ok: false, error: GROWTH_ERROR.denied }
  const supabase = createSupabaseAdminClient()
  const scope = {
    businessUnitId: input.businessUnitId ?? null,
    department: input.department ?? null,
    employeeId: input.employeeId ?? null,
  }
  const { data, error } = await supabase
    .from('growth_metric_actuals')
    .insert({
      organization_key: DEFAULT_ORGANIZATION_KEY,
      metric_definition_id: input.metricDefinitionId,
      period_id: input.periodId,
      as_of_date: input.asOfDate,
      business_unit_id: scope.businessUnitId,
      department: scope.department,
      employee_id: scope.employeeId,
      value: input.value,
      origin_type: 'calculated' satisfies GrowthActualOrigin,
      source_system: input.sourceSystem,
      calculation_version: input.calculationVersion,
      calculated_at: new Date().toISOString(),
      idempotency_key: input.idempotencyKey,
      is_current: true,
    })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    if (dbErrorCode(error) === '23505') {
      const existing = await supabase
        .from('growth_metric_actuals')
        .select('id')
        .eq('metric_definition_id', input.metricDefinitionId)
        .eq('period_id', input.periodId)
        .eq('as_of_date', input.asOfDate)
        .eq('scope_identity', buildScopeIdentity(scope))
        .eq('origin_type', 'calculated')
        .eq('idempotency_key', input.idempotencyKey)
        .eq('is_current', true)
        .maybeSingle<{ id: string }>()
      if (existing.error) {
        logGrowthDbError('growth.metric_actuals.calculated_select_existing', existing.error, { metricDefinitionId: input.metricDefinitionId, periodId: input.periodId })
        return { ok: false, error: GROWTH_ERROR.save }
      }
      if (existing.data) return { ok: true, data: existing.data.id }
    }
    logGrowthDbError('growth.metric_actuals.calculated_upsert', error, { metricDefinitionId: input.metricDefinitionId, periodId: input.periodId })
    return { ok: false, error: GROWTH_ERROR.save }
  }
  if (!data) return { ok: false, error: GROWTH_ERROR.save }
  return { ok: true, data: data.id }
}

export async function createManualOverride(formData: FormData): Promise<ActionResult> {
  const denied = await requireAnyGrowthPermission(ACTUAL_OVERRIDE_PERMISSIONS)
  if (denied) return denied
  const actualId = uuidOrNull(formData.get('actualId'))
  if (!actualId) return { ok: false, error: GROWTH_ERROR.stale }
  const value = decimalString(formData.get('value'), 'Override value')
  if (!value.ok) return { ok: false, error: value.error }
  const reason = nonEmptyText(formData.get('reason'), 'Override reason')
  if (!reason.ok || reason.value.length < 8) return { ok: false, error: 'Override reason must be at least 8 characters.' }
  const actorEmployeeId = await currentEmployeeId()
  if (!actorEmployeeId) return { ok: false, error: 'Your dashboard user must be linked to a Workforce employee before overriding Growth actuals.' }
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('growth_metric_actual_override', {
    p_supersedes_actual_id: actualId,
    p_value: value.value,
    p_reason: reason.value,
    p_actor_employee_id: actorEmployeeId,
    p_idempotency_key: `override:${actualId}:${actorEmployeeId}`,
  }).returns<string>()
  if (error) {
    logGrowthDbError('growth.metric_actuals.override', error, { actualId })
    return { ok: false, error: GROWTH_ERROR.save }
  }
  revalidateGrowthFoundations()
  return { ok: true }
}
