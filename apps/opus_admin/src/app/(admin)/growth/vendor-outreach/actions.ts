'use server'

import { revalidatePath } from 'next/cache'
import { escapeLike, getCallerEmail } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  GROWTH_ERROR,
  growthDbErrorMessage,
  logGrowthDbError,
  missingGrowthRecord,
  requireGrowthPermission,
  type ActionResult,
} from '../_lib/action-utils'

// Server actions for the Vendor Outreach section of the Growth Tracker.
// Roster target edits require growth.admin; outreach log entries only
// require growth.write. Mirrors the { ok } result shape used by
// workforce/daily-tracker/actions.ts.

function revalidateAll() {
  revalidatePath('/growth/vendor-outreach')
  revalidatePath('/growth')
}

async function resolveCallerEmployeeId(): Promise<string | null> {
  const email = await getCallerEmail()
  if (!email) return null
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('workforce_employees')
    .select('id')
    .ilike('email', escapeLike(email))
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

export async function saveOutreachTarget(
  id: string,
  patch: { targetOutreach: number; targetMeetings: number; targetSigned: number },
): Promise<ActionResult> {
  const denied = await requireGrowthPermission('growth.admin')
  if (denied) return denied
  if (
    !Number.isFinite(patch.targetOutreach) ||
    !Number.isFinite(patch.targetMeetings) ||
    !Number.isFinite(patch.targetSigned) ||
    patch.targetOutreach < 0 ||
    patch.targetMeetings < 0 ||
    patch.targetSigned < 0
  ) {
    return { ok: false, error: 'Targets must be zero or positive numbers.' }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_vendor_outreach_targets')
    .update({
      target_outreach: Math.round(patch.targetOutreach),
      target_meetings: Math.round(patch.targetMeetings),
      target_signed: Math.round(patch.targetSigned),
    })
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.vendor_outreach_target.update', error, { targetId: id })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return missingGrowthRecord()

  revalidateAll()
  return { ok: true }
}

export type OutreachLogInput = {
  logDate: string
  staffName: string
  vendorName: string
  category: string
  contactMethod: string
  stage: string
  nextAction: string
  nextActionDate: string | null
  travelCostTzs: number | null
  outcome: string
  notes: string
}

function validateLogInput(input: OutreachLogInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.logDate)) return 'Invalid log date.'
  if (!input.staffName.trim()) return 'Staff name is required.'
  if (!input.vendorName.trim()) return 'Vendor/business name is required.'
  if (input.nextActionDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.nextActionDate)) {
    return 'Invalid next action date.'
  }
  if (input.travelCostTzs !== null && (!Number.isFinite(input.travelCostTzs) || input.travelCostTzs < 0)) {
    return 'Travel cost must be zero or positive.'
  }
  return null
}

export async function addOutreachLogEntry(input: OutreachLogInput): Promise<ActionResult> {
  const denied = await requireGrowthPermission('growth.write')
  if (denied) return denied
  const validationError = validateLogInput(input)
  if (validationError) return { ok: false, error: validationError }

  const employeeId = await resolveCallerEmployeeId()
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('growth_vendor_outreach_log').insert({
    log_date: input.logDate,
    staff_name: input.staffName.trim(),
    vendor_name: input.vendorName.trim(),
    category: input.category,
    contact_method: input.contactMethod,
    stage: input.stage,
    next_action: input.nextAction.trim(),
    next_action_date: input.nextActionDate || null,
    travel_cost_tzs: input.travelCostTzs,
    outcome: input.outcome,
    notes: input.notes.trim(),
    created_by_employee_id: employeeId,
  })
  if (error) {
    logGrowthDbError('growth.vendor_outreach_log.insert', error, { employeeId })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }

  revalidateAll()
  return { ok: true }
}

export type OutreachLogPatch = Partial<OutreachLogInput>

export async function updateOutreachLogEntry(id: string, patch: OutreachLogPatch): Promise<ActionResult> {
  const denied = await requireGrowthPermission('growth.write')
  if (denied) return denied

  const dbPatch: Record<string, unknown> = {}
  if (patch.logDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.logDate)) return { ok: false, error: 'Invalid log date.' }
    dbPatch.log_date = patch.logDate
  }
  if (patch.staffName !== undefined) {
    if (!patch.staffName.trim()) return { ok: false, error: 'Staff name is required.' }
    dbPatch.staff_name = patch.staffName.trim()
  }
  if (patch.vendorName !== undefined) {
    if (!patch.vendorName.trim()) return { ok: false, error: 'Vendor/business name is required.' }
    dbPatch.vendor_name = patch.vendorName.trim()
  }
  if (patch.category !== undefined) dbPatch.category = patch.category
  if (patch.contactMethod !== undefined) dbPatch.contact_method = patch.contactMethod
  if (patch.stage !== undefined) dbPatch.stage = patch.stage
  if (patch.nextAction !== undefined) dbPatch.next_action = patch.nextAction.trim()
  if (patch.nextActionDate !== undefined) {
    if (patch.nextActionDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.nextActionDate)) {
      return { ok: false, error: 'Invalid next action date.' }
    }
    dbPatch.next_action_date = patch.nextActionDate || null
  }
  if (patch.travelCostTzs !== undefined) {
    if (patch.travelCostTzs !== null && (!Number.isFinite(patch.travelCostTzs) || patch.travelCostTzs < 0)) {
      return { ok: false, error: 'Travel cost must be zero or positive.' }
    }
    dbPatch.travel_cost_tzs = patch.travelCostTzs
  }
  if (patch.outcome !== undefined) dbPatch.outcome = patch.outcome
  if (patch.notes !== undefined) dbPatch.notes = patch.notes.trim()

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_vendor_outreach_log')
    .update(dbPatch)
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.vendor_outreach_log.update', error, { logId: id })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return missingGrowthRecord()

  revalidateAll()
  return { ok: true }
}

export async function deleteOutreachLogEntry(id: string): Promise<ActionResult> {
  const denied = await requireGrowthPermission('growth.write')
  if (denied) return denied

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_vendor_outreach_log')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.vendor_outreach_log.delete', error, { logId: id })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.delete) }
  }
  if (!data) return missingGrowthRecord()

  revalidateAll()
  return { ok: true }
}
