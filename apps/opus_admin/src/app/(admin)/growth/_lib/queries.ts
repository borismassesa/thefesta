import { createSupabaseAdminClient } from '@/lib/supabase'
import { ENDED_EMPLOYEE_STATUSES_SQL } from '../../workforce/_lib/types'
import { logGrowthDbError } from './action-utils'

// Shared query helpers for the Growth Tracker module. Pure data-fetching —
// no permission checks here (those live in each route's page.tsx/actions.ts).

export type GrowthCategory = 'sales_marketing' | 'social_media' | 'studio'

export type KpiTarget = {
  id: string
  category: GrowthCategory
  kpiKey: string
  label: string
  unit: string
  monthlyTarget: number
  sortOrder: number
}

export type KpiActual = {
  kpiTargetId: string
  month: string // YYYY-MM-01
  actual: number | null
  notes: string
}

type KpiTargetRow = {
  id: string
  category: GrowthCategory
  kpi_key: string
  label: string
  unit: string
  monthly_target: number
  sort_order: number
}

type KpiActualRow = {
  kpi_target_id: string
  month: string
  actual: number | null
  notes: string
}

export async function getKpiTargets(category: GrowthCategory): Promise<KpiTarget[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_kpi_targets')
    .select('id, category, kpi_key, label, unit, monthly_target, sort_order')
    .eq('category', category)
    .order('sort_order', { ascending: true })
    .returns<KpiTargetRow[]>()
  if (error) {
    logGrowthDbError('growth.kpi_targets.select', error, { category })
    throw new Error('Could not load Growth Tracker KPI targets.')
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    category: r.category,
    kpiKey: r.kpi_key,
    label: r.label,
    unit: r.unit,
    monthlyTarget: r.monthly_target,
    sortOrder: r.sort_order,
  }))
}

export async function getKpiActuals(kpiTargetIds: string[]): Promise<KpiActual[]> {
  if (kpiTargetIds.length === 0) return []
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_kpi_actuals')
    .select('kpi_target_id, month, actual, notes')
    .in('kpi_target_id', kpiTargetIds)
    .returns<KpiActualRow[]>()
  if (error) {
    logGrowthDbError('growth.kpi_actuals.select', error)
    throw new Error('Could not load Growth Tracker KPI actuals.')
  }
  return (data ?? []).map((r) => ({
    kpiTargetId: r.kpi_target_id,
    month: r.month,
    actual: r.actual,
    notes: r.notes,
  }))
}

export type GrowthEmployeeOption = { id: string; name: string; jobTitle: string }

export async function getGrowthEmployeeOptions(): Promise<GrowthEmployeeOption[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id, full_name, job_title, status')
    .not('status', 'in', ENDED_EMPLOYEE_STATUSES_SQL)
    .order('full_name', { ascending: true })
    .returns<Array<{ id: string; full_name: string; job_title: string; status: string }>>()
  if (error) {
    logGrowthDbError('growth.employee_options.select', error)
    throw new Error('Could not load Growth Tracker employee options.')
  }
  return (data ?? []).map((r) => ({ id: r.id, name: r.full_name, jobTitle: r.job_title }))
}
