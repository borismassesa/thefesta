'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  GROWTH_ERROR,
  growthDbErrorMessage,
  logGrowthDbError,
  missingGrowthRecord,
  requireGrowthPermission,
  type ActionResult,
} from './_lib/action-utils'
import { isMonthKey } from './_lib/period'

// Shared server actions for the Growth Tracker's KpiMonthlyGrid, used by the
// marketing / social / studio pages. Filling in a monthly actual is routine
// reporting (growth.write); editing the target itself requires growth.admin.

function revalidateAll() {
  revalidatePath('/growth')
  revalidatePath('/growth/marketing')
  revalidatePath('/growth/social')
  revalidatePath('/growth/studio')
}

export async function updateKpiTarget(input: { kpiTargetId: string; monthlyTarget: number }): Promise<ActionResult> {
  const denied = await requireGrowthPermission('growth.admin')
  if (denied) return denied
  if (!Number.isFinite(input.monthlyTarget) || input.monthlyTarget < 0) {
    return { ok: false, error: 'Target must be a positive number.' }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_kpi_targets')
    .update({ monthly_target: input.monthlyTarget })
    .eq('id', input.kpiTargetId)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.kpi_target.update', error, { targetId: input.kpiTargetId })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return missingGrowthRecord()

  revalidateAll()
  return { ok: true }
}

export async function saveKpiActual(input: {
  kpiTargetId: string
  month: string
  actual: number | null
}): Promise<ActionResult> {
  const denied = await requireGrowthPermission('growth.write')
  if (denied) return denied
  if (!isMonthKey(input.month)) return { ok: false, error: 'Invalid month.' }
  if (input.actual !== null && !Number.isFinite(input.actual)) {
    return { ok: false, error: 'Not a number.' }
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('growth_kpi_actuals').upsert(
    { kpi_target_id: input.kpiTargetId, month: input.month, actual: input.actual },
    { onConflict: 'kpi_target_id,month' },
  )
  if (error) {
    logGrowthDbError('growth.kpi_actual.upsert', error, { targetId: input.kpiTargetId })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }

  revalidateAll()
  return { ok: true }
}
