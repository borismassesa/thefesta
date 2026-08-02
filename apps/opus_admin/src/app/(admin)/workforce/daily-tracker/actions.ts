'use server'

import { revalidatePath } from 'next/cache'
import { escapeLike, getCallerEmail, hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

// Server actions for the MD Daily Tracker. Each engine's MD can only write
// their own engine's rows (md_tracker.<engine>.write); the CEO/owner review
// (ceo_comment + per-engine reviewed mark) requires md_tracker.review.
// Mirrors the upsert-on-unique-key pattern used by /me/reports/actions.ts.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const STATUS_VALUES = ['Planned', 'In Progress', 'Done', 'Carried Over', 'Blocked'] as const
type TrackerStatus = (typeof STATUS_VALUES)[number]

export type ActionResult = { ok: true } | { ok: false; error: string }

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

async function canWriteEngine(engineSlug: string): Promise<boolean> {
  const [engineWrite, review] = await Promise.all([
    hasPermission(`md_tracker.${engineSlug}.write`),
    hasPermission('md_tracker.review'),
  ])
  return engineWrite || review
}

async function getEngineSlug(engineId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('md_tracker_engines')
    .select('slug')
    .eq('id', engineId)
    .maybeSingle<{ slug: string }>()
  return data?.slug ?? null
}

export type SaveEntryInput = {
  weekId: string
  engineId: string
  entryDate: string
  topPriority: string
  otherTasks: string
  status: TrackerStatus | null
  blockers: string
  endOfDayNote: string
}

export async function saveEntry(input: SaveEntryInput): Promise<ActionResult> {
  if (!DATE_RE.test(input.entryDate)) return { ok: false, error: 'Invalid date.' }
  if (input.status !== null && !STATUS_VALUES.includes(input.status)) {
    return { ok: false, error: 'Invalid status.' }
  }

  const engineSlug = await getEngineSlug(input.engineId)
  if (!engineSlug) return { ok: false, error: 'Engine not found.' }
  if (!(await canWriteEngine(engineSlug))) {
    return { ok: false, error: `You don't have permission to edit ${engineSlug}'s entries.` }
  }

  const employeeId = await resolveCallerEmployeeId()
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('md_tracker_entries').upsert(
    {
      week_id: input.weekId,
      engine_id: input.engineId,
      entry_date: input.entryDate,
      top_priority: input.topPriority.trim(),
      other_tasks: input.otherTasks.trim(),
      status: input.status,
      blockers: input.blockers.trim(),
      end_of_day_note: input.endOfDayNote.trim(),
      updated_by_employee_id: employeeId,
    },
    { onConflict: 'week_id,engine_id,entry_date' },
  )
  if (error) {
    console.error('[md-tracker] saveEntry failed', error)
    return { ok: false, error: error.message || 'Could not save.' }
  }

  revalidatePath('/workforce/daily-tracker')
  return { ok: true }
}

export type SaveWeekReviewInput = {
  weekId: string
  engineId: string
  wins: string
  carriedToNextWeek: string
  ceoComment?: string
}

export async function saveWeekReview(input: SaveWeekReviewInput): Promise<ActionResult> {
  const engineSlug = await getEngineSlug(input.engineId)
  if (!engineSlug) return { ok: false, error: 'Engine not found.' }

  const [canWriteWins, canReview] = await Promise.all([
    canWriteEngine(engineSlug),
    hasPermission('md_tracker.review'),
  ])
  if (!canWriteWins) {
    return { ok: false, error: `You don't have permission to edit ${engineSlug}'s week review.` }
  }
  if (input.ceoComment !== undefined && !canReview) {
    return { ok: false, error: "You don't have permission to write the CEO comment." }
  }

  const supabase = createSupabaseAdminClient()
  const patch: Record<string, unknown> = {
    week_id: input.weekId,
    engine_id: input.engineId,
    wins: input.wins.trim(),
    carried_to_next_week: input.carriedToNextWeek.trim(),
  }
  if (canReview && input.ceoComment !== undefined) patch.ceo_comment = input.ceoComment.trim()

  const { error } = await supabase
    .from('md_tracker_week_reviews')
    .upsert(patch, { onConflict: 'week_id,engine_id' })
  if (error) {
    console.error('[md-tracker] saveWeekReview failed', error)
    return { ok: false, error: error.message || 'Could not save.' }
  }

  revalidatePath('/workforce/daily-tracker')
  return { ok: true }
}

// Assigning who's MD for an engine is an org-level call, not a per-engine
// write — gated the same way as the CEO review, not by md_tracker.<engine>.write.
// An engine can have more than one MD (co-leads), so this replaces the
// whole set rather than adding/removing one at a time.
export async function assignEngineMds(engineId: string, employeeIds: string[]): Promise<ActionResult> {
  if (!(await hasPermission('md_tracker.review'))) {
    return { ok: false, error: "You don't have permission to assign an MD." }
  }
  const ids = [...new Set(employeeIds)]
  const supabase = createSupabaseAdminClient()
  if (ids.length > 0) {
    const { data: found } = await supabase
      .from('workforce_employees')
      .select('id')
      .in('id', ids)
      .returns<{ id: string }[]>()
    if ((found?.length ?? 0) !== ids.length) {
      return { ok: false, error: 'One or more of those employees no longer exist.' }
    }
  }
  const { error } = await supabase
    .from('md_tracker_engines')
    .update({ md_employee_ids: ids })
    .eq('id', engineId)
  if (error) {
    console.error('[md-tracker] assignEngineMds failed', error)
    return { ok: false, error: error.message || 'Could not save.' }
  }

  revalidatePath('/workforce/daily-tracker')
  return { ok: true }
}

// The acting MD is a single temporary stand-in (e.g. the MD is on leave),
// distinct from the (possibly multiple) permanent MDs above.
export async function assignActingMd(engineId: string, employeeId: string | null): Promise<ActionResult> {
  if (!(await hasPermission('md_tracker.review'))) {
    return { ok: false, error: "You don't have permission to assign an acting MD." }
  }
  const supabase = createSupabaseAdminClient()
  if (employeeId) {
    const { data: employee } = await supabase
      .from('workforce_employees')
      .select('id')
      .eq('id', employeeId)
      .maybeSingle<{ id: string }>()
    if (!employee) return { ok: false, error: 'That employee no longer exists.' }
  }
  const { error } = await supabase
    .from('md_tracker_engines')
    .update({ acting_md_employee_id: employeeId })
    .eq('id', engineId)
  if (error) {
    console.error('[md-tracker] assignActingMd failed', error)
    return { ok: false, error: error.message || 'Could not save.' }
  }

  revalidatePath('/workforce/daily-tracker')
  return { ok: true }
}

export async function setEngineWorksSaturday(engineId: string, worksSaturday: boolean): Promise<ActionResult> {
  if (!(await hasPermission('md_tracker.review'))) {
    return { ok: false, error: "You don't have permission to change this." }
  }
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('md_tracker_engines')
    .update({ works_saturday: worksSaturday })
    .eq('id', engineId)
  if (error) {
    console.error('[md-tracker] setEngineWorksSaturday failed', error)
    return { ok: false, error: error.message || 'Could not save.' }
  }

  revalidatePath('/workforce/daily-tracker')
  return { ok: true }
}

// Per-engine review (replaces the old single md_tracker_weeks.reviewed_by_employee_id
// flag) — a CEO can review OpusFesta's week without that implicitly covering
// OpusStudio/OpusPass too, and a mistaken mark can be undone.
export async function markEngineReviewed(weekId: string, engineId: string): Promise<ActionResult> {
  if (!(await hasPermission('md_tracker.review'))) {
    return { ok: false, error: "You don't have permission to mark this reviewed." }
  }
  const employeeId = await resolveCallerEmployeeId()
  if (!employeeId) return { ok: false, error: 'No workforce profile — ask an admin to add you.' }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('md_tracker_week_reviews').upsert(
    {
      week_id: weekId,
      engine_id: engineId,
      reviewed_by_employee_id: employeeId,
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: 'week_id,engine_id' },
  )
  if (error) return { ok: false, error: error.message || 'Could not save.' }

  revalidatePath('/workforce/daily-tracker')
  return { ok: true }
}

export async function unmarkEngineReviewed(weekId: string, engineId: string): Promise<ActionResult> {
  if (!(await hasPermission('md_tracker.review'))) {
    return { ok: false, error: "You don't have permission to undo this." }
  }
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('md_tracker_week_reviews')
    .update({ reviewed_by_employee_id: null, reviewed_at: null })
    .eq('week_id', weekId)
    .eq('engine_id', engineId)
  if (error) return { ok: false, error: error.message || 'Could not save.' }

  revalidatePath('/workforce/daily-tracker')
  return { ok: true }
}
