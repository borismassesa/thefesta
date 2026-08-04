'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { hasPermission } from '@/lib/admin-auth'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { recordSensitiveWorkspaceAction } from '@/lib/workspace/activity'
import { toSafeMessage } from '@/lib/workspace/errors'
import { trackerErrorToken, trackerMessage } from '@/lib/tracker/errors'
import { getMyUnits } from '@/lib/tracker/queries'
import { isSelectable, type TrackerStatus } from '@/lib/tracker/status'

// Tracker server actions.
//
// THE IDENTITY RULE. None of these takes an employee id; it comes from
// requireWorkspaceCapability. Every one of them then confirms the caller is
// assigned to the entry's unit before touching anything, and the database
// functions re-check ownership under a row lock.
//
// THE STATUS RULE. isSelectable() gates what a client may set. 'missed' is not
// on that list and never will be: it is calculated by tracker_mark_missed()
// after the deadline. An employee who could select it would either never do so
// or do so out of guilt, and the number would stop meaning anything.

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

/** Confirm the caller is assigned to this entry's unit, and say in what role. */
async function assignmentFor(
  employeeId: string,
  units: { id: string; role: string }[],
  entryId: string,
): Promise<{ unitId: string; role: string; ownerEmployeeId: string } | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('tracker_entries')
    .select('unit_id, employee_id')
    .eq('id', entryId)
    .maybeSingle<{ unit_id: string; employee_id: string }>()
  if (!data) return null
  const unit = units.find((u) => u.id === data.unit_id)
  if (!unit) return null
  return { unitId: data.unit_id, role: unit.role, ownerEmployeeId: data.employee_id }
}

export type EntryPatch = {
  progressSummary?: string
  blockers?: string
  blockerOwnerEmployeeId?: string | null
  expectedResolutionDate?: string | null
  decisionsRequired?: string
  nextSteps?: string
}

/** Save the narrative fields. Only the owner, and only while it is still open. */
export async function saveEntry(entryId: string, patch: EntryPatch): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'tracker.save' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const units = await getMyUnits(employee)
  const assignment = await assignmentFor(employee.id, units, entryId)
  if (!assignment) return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }
  if (assignment.ownerEmployeeId !== employee.id) {
    return { ok: false, error: trackerMessage({ message: 'tracker.not_owner' }) }
  }

  const text = (value: string | undefined, max = 5000) =>
    value === undefined ? undefined : value.slice(0, max)

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('tracker_entries')
    .update({
      progress_summary: text(patch.progressSummary),
      blockers: text(patch.blockers),
      blocker_owner_employee_id: patch.blockerOwnerEmployeeId ?? null,
      expected_resolution_date: patch.expectedResolutionDate || null,
      decisions_required: text(patch.decisionsRequired),
      next_steps: text(patch.nextSteps),
    })
    .eq('id', entryId)
    .eq('employee_id', employee.id)
    // A submitted or accepted entry is not editable in place; a reviewer
    // returns it first, which is what keeps the history honest.
    .in('review_status', ['pending', 'returned'])
  if (error) {
    logDbError('tracker.save', error, { employeeId: employee.id })
    return { ok: false, error: trackerMessage(error) }
  }

  revalidatePath('/workspace/tracker')
  return { ok: true }
}

export type ItemInput = {
  kind: 'planned' | 'completed' | 'blocker' | 'decision' | 'next_step'
  title: string
  detail?: string
  status?: TrackerStatus
  linkedTaskId?: string | null
  linkedProjectId?: string | null
  linkedGoalId?: string | null
}

export async function addItem(entryId: string, input: ItemInput): Promise<ActionResult<{ id: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'tracker.add_item' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const title = input.title.trim()
  if (title.length === 0) return { ok: false, error: 'Give the item a title.' }
  if (title.length > 500) return { ok: false, error: 'Keep the title under 500 characters.' }

  const status = input.status ?? 'not_started'
  if (!isSelectable(status)) {
    // The gate. 'missed', 'carried_over', 'not_working_day' and 'waived' are
    // all system-set; a client asking for one is either confused or probing.
    return { ok: false, error: 'That status is set by the system, not chosen.' }
  }

  const units = await getMyUnits(employee)
  const assignment = await assignmentFor(employee.id, units, entryId)
  if (!assignment) return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }
  if (assignment.ownerEmployeeId !== employee.id && assignment.role !== 'contributor') {
    return { ok: false, error: trackerMessage({ message: 'tracker.not_owner' }) }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('tracker_entry_items')
    .insert({
      entry_id: entryId,
      kind: input.kind,
      title,
      detail: (input.detail ?? '').slice(0, 5000),
      status,
      linked_task_id: input.linkedTaskId ?? null,
      linked_project_id: input.linkedProjectId ?? null,
      linked_goal_id: input.linkedGoalId ?? null,
      source: 'manual',
    })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    logDbError('tracker.add_item', error, { employeeId: employee.id })
    return { ok: false, error: trackerMessage(error) }
  }

  revalidatePath('/workspace/tracker')
  return { ok: true, id: data.id }
}

export async function setItemStatus(
  itemId: string,
  status: TrackerStatus,
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'tracker.item_status' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (!isSelectable(status)) {
    return { ok: false, error: 'That status is set by the system, not chosen.' }
  }

  const supabase = createSupabaseAdminClient()
  const { data: item } = await supabase
    .from('tracker_entry_items')
    .select('id, entry_id')
    .eq('id', itemId)
    .maybeSingle<{ id: string; entry_id: string }>()
  if (!item) return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }

  const units = await getMyUnits(employee)
  const assignment = await assignmentFor(employee.id, units, item.entry_id)
  if (!assignment || assignment.ownerEmployeeId !== employee.id) {
    return { ok: false, error: trackerMessage({ message: 'tracker.not_owner' }) }
  }

  const { error } = await supabase
    .from('tracker_entry_items')
    .update({ status })
    .eq('id', itemId)
    // A carried item's source row must keep saying it carried. Restricting the
    // update to open statuses stops an edit rewriting that history.
    .in('status', ['not_started', 'in_progress', 'done', 'blocked'])
  if (error) {
    logDbError('tracker.item_status', error, { employeeId: employee.id })
    return { ok: false, error: trackerMessage(error) }
  }

  revalidatePath('/workspace/tracker')
  return { ok: true }
}

export async function removeItem(itemId: string): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'tracker.remove_item' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()
  const { data: item } = await supabase
    .from('tracker_entry_items')
    .select('id, entry_id, carried_from_item_id')
    .eq('id', itemId)
    .maybeSingle<{ id: string; entry_id: string; carried_from_item_id: string | null }>()
  if (!item) return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }

  const units = await getMyUnits(employee)
  const assignment = await assignmentFor(employee.id, units, item.entry_id)
  if (!assignment || assignment.ownerEmployeeId !== employee.id) {
    return { ok: false, error: trackerMessage({ message: 'tracker.not_owner' }) }
  }
  if (item.carried_from_item_id) {
    // Deleting a carried item would break the chain back to the day the work
    // was first raised. Mark it done or waived instead.
    return {
      ok: false,
      error: 'This came from a previous day. Mark it done rather than removing it.',
    }
  }

  const { error } = await supabase.from('tracker_entry_items').delete().eq('id', itemId)
  if (error) {
    logDbError('tracker.remove_item', error, { employeeId: employee.id })
    return { ok: false, error: trackerMessage(error) }
  }

  revalidatePath('/workspace/tracker')
  return { ok: true }
}

export async function submitEntry(entryId: string): Promise<ActionResult<{ status: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'tracker.submit' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('tracker_submit_entry', {
    p_entry_id: entryId,
    p_employee_id: employee.id,
  })
  if (error) {
    if (!trackerErrorToken(error)) logDbError('tracker.submit', error, { employeeId: employee.id })
    return { ok: false, error: trackerMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.tracker.submitted',
    summary: 'Submitted a daily tracker entry',
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `tracker_entries:${entryId}`,
    metadata: { entryId, derivedStatus: data },
  })

  revalidatePath('/workspace/tracker')
  return { ok: true, status: typeof data === 'string' ? data : 'done' }
}

export async function reviewEntry(
  entryId: string,
  action: 'start_review' | 'return' | 'accept' | 'waive' | 'reopen',
  note?: string,
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('workspace.read', {
      action: `tracker.${action}`,
    }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const units = await getMyUnits(employee)
  const assignment = await assignmentFor(employee.id, units, entryId)
  const isAdmin = await hasPermission('workforce.write')
  if (!assignment && !isAdmin) {
    return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }
  }

  // The actor role is derived, never taken from the client. An owner who is
  // somehow also a reviewer on their own unit must not thereby gain the power
  // to accept their own entry; the database refuses owner review regardless.
  const isOwner = assignment?.ownerEmployeeId === employee.id
  const role = isAdmin ? 'admin' : isOwner ? 'owner' : 'reviewer'

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('tracker_review_action', {
    p_entry_id: entryId,
    p_action: action,
    p_actor_employee_id: employee.id,
    p_actor_role: role,
    p_actor_clerk_id: employee.clerkUserId,
    p_note: note ?? null,
  })
  if (error) {
    if (!trackerErrorToken(error)) logDbError('tracker.review', error, { employeeId: employee.id })
    return { ok: false, error: trackerMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: assignment?.ownerEmployeeId ?? employee.id,
    eventType: `workspace.tracker.${action}`,
    summary: `Tracker entry moved to ${typeof data === 'string' ? data : action}`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `tracker_entries:${entryId}`,
    metadata: { entryId, action, actorRole: role },
    severity: action === 'waive' ? 'warn' : 'info',
  })

  revalidatePath('/workspace/tracker')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Weekly summary
// ---------------------------------------------------------------------------

export type WeeklyPatch = {
  wins?: string
  missedCommitments?: string
  carriedForward?: string
  keyBlockers?: string
  risks?: string
  decisionsRequired?: string
  nextWeekPriorities?: string
}

export async function saveWeeklySummary(
  summaryId: string,
  patch: WeeklyPatch,
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'tracker.weekly_save' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()
  const { data: summary } = await supabase
    .from('weekly_summaries')
    .select('id, unit_id, status')
    .eq('id', summaryId)
    .maybeSingle<{ id: string; unit_id: string; status: string }>()
  if (!summary) return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }

  const units = await getMyUnits(employee)
  if (!units.some((u) => u.id === summary.unit_id)) {
    return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }
  }
  if (summary.status === 'accepted' || summary.status === 'locked') {
    return { ok: false, error: trackerMessage({ message: 'tracker.already_accepted' }) }
  }

  const text = (value: string | undefined) => (value === undefined ? undefined : value.slice(0, 10000))

  const { error } = await supabase
    .from('weekly_summaries')
    .update({
      wins: text(patch.wins),
      missed_commitments: text(patch.missedCommitments),
      carried_forward: text(patch.carriedForward),
      key_blockers: text(patch.keyBlockers),
      risks: text(patch.risks),
      decisions_required: text(patch.decisionsRequired),
      next_week_priorities: text(patch.nextWeekPriorities),
    })
    .eq('id', summaryId)
    .in('status', ['draft', 'returned'])
  if (error) {
    logDbError('tracker.weekly_save', error, { employeeId: employee.id })
    return { ok: false, error: trackerMessage(error) }
  }

  revalidatePath('/workspace/tracker')
  return { ok: true }
}

export async function submitWeeklySummary(summaryId: string): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', {
      action: 'tracker.weekly_submit',
    }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()
  const { data: summary } = await supabase
    .from('weekly_summaries')
    .select('id, unit_id, status')
    .eq('id', summaryId)
    .maybeSingle<{ id: string; unit_id: string; status: string }>()
  if (!summary) return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }

  const units = await getMyUnits(employee)
  if (!units.some((u) => u.id === summary.unit_id)) {
    return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }
  }

  const { error } = await supabase
    .from('weekly_summaries')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', summaryId)
    // Concurrency guard: only a draft or returned summary may be submitted, so
    // two submits cannot both move it.
    .in('status', ['draft', 'returned'])
  if (error) {
    logDbError('tracker.weekly_submit', error, { employeeId: employee.id })
    return { ok: false, error: trackerMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.tracker.weekly_submitted',
    summary: 'Submitted a weekly execution review',
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `weekly_summaries:${summaryId}`,
    metadata: { summaryId },
  })

  revalidatePath('/workspace/tracker')
  return { ok: true }
}

export async function addTrackerComment(
  entryId: string,
  body: string,
  options: { internal?: boolean } = {},
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('workspace.read', { action: 'tracker.comment' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const text = body.trim()
  if (text.length === 0) return { ok: false, error: 'Write something first.' }
  if (text.length > 5000) return { ok: false, error: 'Keep comments under 5000 characters.' }

  const units = await getMyUnits(employee)
  const assignment = await assignmentFor(employee.id, units, entryId)
  const isAdmin = await hasPermission('workforce.write')
  if (!assignment && !isAdmin) {
    return { ok: false, error: trackerMessage({ message: 'tracker.not_found' }) }
  }

  const isOwner = assignment?.ownerEmployeeId === employee.id
  // Only a reviewer may write a reviewer-only note. An author marking their own
  // comment internal would hide it from the people it is addressed to.
  const internal = Boolean(options.internal) && !isOwner

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('tracker_comments').insert({
    entry_id: entryId,
    author_employee_id: employee.id,
    author_name: employee.name,
    body: text,
    visibility: internal ? 'internal' : 'all',
  })
  if (error) {
    logDbError('tracker.comment', error, { employeeId: employee.id })
    return { ok: false, error: trackerMessage(error) }
  }

  revalidatePath('/workspace/tracker')
  return { ok: true }
}
