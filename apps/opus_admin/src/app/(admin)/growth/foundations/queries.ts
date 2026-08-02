import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase'
import { logGrowthDbError } from '../_lib/action-utils'
import {
  GrowthFoundationsUnavailableError,
  isMissingGrowthFoundationRelation,
} from '../_lib/foundation-availability'
import type {
  GrowthBusinessUnit,
  GrowthMetricActual,
  GrowthMetricDefinition,
  GrowthMetricTarget,
  GrowthPeriod,
  GrowthTargetEvent,
} from './types'

type BusinessUnitRow = {
  id: string
  code: string
  name: string
  description: string
  default_currency_code: string
  is_active: boolean
  display_order: number
  archived_at: string | null
}

type PeriodRow = {
  id: string
  period_type: GrowthPeriod['periodType']
  start_date: string
  end_date: string
  label: string
  fiscal_year: number
  fiscal_quarter: number | null
  status: GrowthPeriod['status']
}

type MetricDefinitionRow = {
  id: string
  code: string
  name: string
  description: string
  business_unit_id: string | null
  department: GrowthMetricDefinition['department']
  owner_employee_id: string | null
  measurement_unit: GrowthMetricDefinition['measurementUnit']
  source_mode: GrowthMetricDefinition['sourceMode']
  direction: GrowthMetricDefinition['direction']
  aggregation_method: GrowthMetricDefinition['aggregationMethod']
  value_type: GrowthMetricDefinition['valueType']
  default_currency_code: string | null
  calculation_key: string | null
  data_source_key: string | null
  review_frequency: GrowthMetricDefinition['reviewFrequency']
  evidence_required: boolean
  is_active: boolean
  lock_version: number
  archived_at: string | null
}

type TargetRow = {
  id: string
  metric_definition_id: string
  period_id: string
  business_unit_id: string | null
  department: GrowthMetricTarget['department']
  employee_id: string | null
  target_value: string | number | null
  lower_bound: string | number | null
  upper_bound: string | number | null
  status: GrowthMetricTarget['status']
  is_current: boolean
  owner_employee_id: string | null
  submitted_by_employee_id: string | null
  approved_by_employee_id: string | null
  submitted_at: string | null
  approved_at: string | null
  effective_from: string
  effective_to: string | null
  revision_number: number
  revision_reason: string | null
  supersedes_target_id: string | null
  lock_version: number
}

type ActualRow = {
  id: string
  metric_definition_id: string
  period_id: string
  as_of_date: string
  business_unit_id: string | null
  department: GrowthMetricActual['department']
  employee_id: string | null
  value: string | number
  origin_type: GrowthMetricActual['originType']
  source_system: string | null
  calculation_version: string | null
  entered_by_employee_id: string | null
  override_reason: string | null
  supersedes_actual_id: string | null
  is_current: boolean
  created_at: string
}

type EventRow = {
  id: string
  target_id: string
  event_type: string
  actor_employee_id: string | null
  old_status: GrowthTargetEvent['oldStatus']
  new_status: GrowthTargetEvent['newStatus']
  change_summary: string
  reason: string | null
  created_at: string
}

function decimal(value: string | number | null): string | null {
  return value === null ? null : String(value)
}

function throwGrowthQueryError(
  operation: string,
  error: unknown,
  fallback: string,
  context: Record<string, string | number | null | undefined> = {},
): never {
  if (isMissingGrowthFoundationRelation(error)) {
    throw new GrowthFoundationsUnavailableError()
  }
  logGrowthDbError(operation, error, context)
  throw new Error(fallback)
}

export async function listGrowthBusinessUnits(includeArchived = false): Promise<GrowthBusinessUnit[]> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('growth_business_units')
    .select('id, code, name, description, default_currency_code, is_active, display_order, archived_at')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (!includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query.returns<BusinessUnitRow[]>()
  if (error) {
    throwGrowthQueryError('growth.business_units.select', error, 'Could not load Growth business units.')
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    defaultCurrencyCode: row.default_currency_code,
    isActive: row.is_active,
    displayOrder: row.display_order,
    archivedAt: row.archived_at,
  }))
}

export async function listGrowthPeriods(): Promise<GrowthPeriod[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_periods')
    .select('id, period_type, start_date, end_date, label, fiscal_year, fiscal_quarter, status')
    .order('start_date', { ascending: false })
    .returns<PeriodRow[]>()
  if (error) {
    throwGrowthQueryError('growth.periods.select', error, 'Could not load Growth periods.')
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    periodType: row.period_type,
    startDate: row.start_date,
    endDate: row.end_date,
    label: row.label,
    fiscalYear: row.fiscal_year,
    fiscalQuarter: row.fiscal_quarter,
    status: row.status,
  }))
}

export async function listGrowthMetricDefinitions(): Promise<GrowthMetricDefinition[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_metric_definitions')
    .select('id, code, name, description, business_unit_id, department, owner_employee_id, measurement_unit, source_mode, direction, aggregation_method, value_type, default_currency_code, calculation_key, data_source_key, review_frequency, evidence_required, is_active, lock_version, archived_at')
    .order('code', { ascending: true })
    .returns<MetricDefinitionRow[]>()
  if (error) {
    throwGrowthQueryError('growth.metric_definitions.select', error, 'Could not load Growth KPI definitions.')
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    businessUnitId: row.business_unit_id,
    department: row.department,
    ownerEmployeeId: row.owner_employee_id,
    ownerName: null,
    measurementUnit: row.measurement_unit,
    sourceMode: row.source_mode,
    direction: row.direction,
    aggregationMethod: row.aggregation_method,
    valueType: row.value_type,
    defaultCurrencyCode: row.default_currency_code,
    calculationKey: row.calculation_key,
    dataSourceKey: row.data_source_key,
    reviewFrequency: row.review_frequency,
    evidenceRequired: row.evidence_required,
    isActive: row.is_active,
    lockVersion: row.lock_version,
    archivedAt: row.archived_at,
  }))
}

export async function listGrowthTargets(metricDefinitionId?: string): Promise<GrowthMetricTarget[]> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('growth_metric_targets')
    .select('id, metric_definition_id, period_id, business_unit_id, department, employee_id, target_value, lower_bound, upper_bound, status, is_current, owner_employee_id, submitted_by_employee_id, approved_by_employee_id, submitted_at, approved_at, effective_from, effective_to, revision_number, revision_reason, supersedes_target_id, lock_version')
    .order('created_at', { ascending: false })

  if (metricDefinitionId) query = query.eq('metric_definition_id', metricDefinitionId)

  const { data, error } = await query.returns<TargetRow[]>()
  if (error) {
    throwGrowthQueryError('growth.metric_targets.select', error, 'Could not load Growth KPI targets.', { metricDefinitionId })
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    metricDefinitionId: row.metric_definition_id,
    periodId: row.period_id,
    businessUnitId: row.business_unit_id,
    department: row.department,
    employeeId: row.employee_id,
    targetValue: decimal(row.target_value),
    lowerBound: decimal(row.lower_bound),
    upperBound: decimal(row.upper_bound),
    status: row.status,
    isCurrent: row.is_current,
    ownerEmployeeId: row.owner_employee_id,
    submittedByEmployeeId: row.submitted_by_employee_id,
    approvedByEmployeeId: row.approved_by_employee_id,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    revisionNumber: row.revision_number,
    revisionReason: row.revision_reason,
    supersedesTargetId: row.supersedes_target_id,
    lockVersion: row.lock_version,
  }))
}

export async function listGrowthActuals(metricDefinitionId?: string): Promise<GrowthMetricActual[]> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('growth_metric_actuals')
    .select('id, metric_definition_id, period_id, as_of_date, business_unit_id, department, employee_id, value, origin_type, source_system, calculation_version, entered_by_employee_id, override_reason, supersedes_actual_id, is_current, created_at')
    .order('as_of_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (metricDefinitionId) query = query.eq('metric_definition_id', metricDefinitionId)

  const { data, error } = await query.returns<ActualRow[]>()
  if (error) {
    throwGrowthQueryError('growth.metric_actuals.select', error, 'Could not load Growth KPI actuals.', { metricDefinitionId })
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    metricDefinitionId: row.metric_definition_id,
    periodId: row.period_id,
    asOfDate: row.as_of_date,
    businessUnitId: row.business_unit_id,
    department: row.department,
    employeeId: row.employee_id,
    value: String(row.value),
    originType: row.origin_type,
    sourceSystem: row.source_system,
    calculationVersion: row.calculation_version,
    enteredByEmployeeId: row.entered_by_employee_id,
    overrideReason: row.override_reason,
    supersedesActualId: row.supersedes_actual_id,
    isCurrent: row.is_current,
    createdAt: row.created_at,
  }))
}

export async function listGrowthTargetEvents(targetId: string): Promise<GrowthTargetEvent[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_metric_target_events')
    .select('id, target_id, event_type, actor_employee_id, old_status, new_status, change_summary, reason, created_at')
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .returns<EventRow[]>()
  if (error) {
    throwGrowthQueryError('growth.metric_target_events.select', error, 'Could not load Growth target history.', { targetId })
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    targetId: row.target_id,
    eventType: row.event_type,
    actorEmployeeId: row.actor_employee_id,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    changeSummary: row.change_summary,
    reason: row.reason,
    createdAt: row.created_at,
  }))
}
