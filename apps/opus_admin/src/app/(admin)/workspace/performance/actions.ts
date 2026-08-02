'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { hasPermission } from '@/lib/admin-auth'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { recordSensitiveWorkspaceAction } from '@/lib/workspace/activity'
import { toSafeMessage } from '@/lib/workspace/errors'
import { performanceErrorToken, performanceMessage } from '@/lib/performance/errors'
import { GOAL_LEVELS, GOAL_VISIBILITIES, type GoalLevel, type GoalVisibility } from '@/lib/performance/goals'

// Performance server actions.
//
// THE IDENTITY RULE, as everywhere in Workspace: none of these takes an
// employee id. It comes from requireWorkspaceCapability, which resolves it from
// the Clerk session. A browser cannot name whose review it is writing.
//
// EVERY ONE OF THEM IS AUDITED. recordSensitiveWorkspaceAction is called on all
// the write paths, at severity 'warn' for the ones that touch a rating, because
// "all rating changes are audited" has to be true of the application layer as
// well as the table.

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

/** Whether the caller is People Ops. HR is the only role with a key to this module. */
async function isHrActor(): Promise<boolean> {
  return hasPermission('workforce.write')
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type CreateGoalInput = {
  title: string
  description?: string
  level?: GoalLevel
  parentGoalId?: string | null
  cycleId?: string | null
  periodId?: string | null
  startDate?: string | null
  dueDate?: string | null
  weight?: number
  visibility?: GoalVisibility
  measurementMethod?: string
}

export async function createGoal(input: CreateGoalInput): Promise<ActionResult<{ goalId: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.goal.create' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const title = input.title.trim()
  if (title.length === 0) return { ok: false, error: 'Give the goal a title.' }
  if (title.length > 500) return { ok: false, error: 'Keep the title under 500 characters.' }

  const isHr = await isHrActor()
  // An employee proposes personal goals. Company, brand and department goals
  // are set by People Ops, so the level is not a free choice from the browser.
  const level: GoalLevel =
    input.level && GOAL_LEVELS.includes(input.level) && isHr ? input.level : 'employee'
  const visibility: GoalVisibility =
    input.visibility && GOAL_VISIBILITIES.includes(input.visibility) ? input.visibility : 'manager'

  const supabase = createSupabaseAdminClient()

  // A goal may only align to one the employee can actually see, or a guessed
  // uuid becomes a way to discover what other teams are working on.
  if (input.parentGoalId) {
    const { data: ok } = await supabase.rpc('goal_is_visible_to', {
      p_goal_id: input.parentGoalId,
      p_employee_id: employee.id,
      p_is_admin: isHr,
    })
    if (ok !== true) return { ok: false, error: performanceMessage({ message: 'goal.parent_not_found' }) }
  }

  const { data: created, error } = await supabase
    .from('goals')
    .insert({
      title,
      description: (input.description ?? '').slice(0, 20000),
      level,
      parent_goal_id: input.parentGoalId ?? null,
      owner_employee_id: employee.id,
      created_by_employee_id: employee.id,
      department: employee.department ?? null,
      cycle_id: input.cycleId ?? null,
      period_id: input.periodId ?? null,
      start_date: input.startDate || null,
      due_date: input.dueDate || null,
      weight: Number.isFinite(input.weight) ? input.weight : 0,
      visibility,
      measurement_method: input.measurementMethod ?? 'key_results',
      approval_status: 'draft',
      status: 'not_started',
    })
    .select('id')
    .single<{ id: string }>()

  if (error) {
    if (!performanceErrorToken(error)) {
      logDbError('performance.goal_create', error, { employeeId: employee.id })
    }
    return { ok: false, error: performanceMessage(error) }
  }

  revalidatePath('/workspace/performance')
  return { ok: true, goalId: created.id }
}

export async function updateGoalProgress(
  goalId: string,
  progress: number,
  note?: string,
): Promise<ActionResult<{ progress: number }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.goal.progress' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    return { ok: false, error: performanceMessage({ message: 'goal.progress_out_of_range' }) }
  }

  const isHr = await isHrActor()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('goal_update_progress', {
    p_goal_id: goalId,
    p_employee_id: employee.id,
    p_progress: progress,
    p_note: note ?? null,
    p_is_admin: isHr,
  })
  if (error) {
    if (!performanceErrorToken(error)) {
      logDbError('performance.goal_progress', error, { employeeId: employee.id })
    }
    return { ok: false, error: performanceMessage(error) }
  }

  revalidatePath('/workspace/performance')
  return { ok: true, progress: Number(data ?? progress) }
}

/** Attach evidence to a goal. A link somebody chose, never a computed input. */
export async function addGoalEvidence(
  goalId: string,
  body: string,
  link?: { taskId?: string; reportSubmissionId?: string; trackerEntryId?: string },
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.goal.evidence' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const text = body.trim()
  if (text.length === 0) return { ok: false, error: 'Say what the evidence is.' }
  if (text.length > 5000) return { ok: false, error: 'Keep it under 5000 characters.' }

  const isHr = await isHrActor()
  const supabase = createSupabaseAdminClient()
  const { data: visible } = await supabase.rpc('goal_is_visible_to', {
    p_goal_id: goalId,
    p_employee_id: employee.id,
    p_is_admin: isHr,
  })
  if (visible !== true) return { ok: false, error: performanceMessage({ message: 'goal.not_found' }) }

  const { error } = await supabase.from('goal_updates').insert({
    goal_id: goalId,
    author_employee_id: employee.id,
    author_name: employee.name,
    update_type: 'evidence',
    body: text,
    linked_task_id: link?.taskId ?? null,
    linked_report_submission_id: link?.reportSubmissionId ?? null,
    linked_tracker_entry_id: link?.trackerEntryId ?? null,
  })
  if (error) {
    logDbError('performance.goal_evidence', error, { employeeId: employee.id })
    return { ok: false, error: performanceMessage(error) }
  }

  revalidatePath('/workspace/performance')
  return { ok: true }
}

export async function submitGoalForApproval(goalId: string): Promise<ActionResult<{ status: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.goal.submit' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('goal_submit_for_approval', {
    p_goal_id: goalId,
    p_employee_id: employee.id,
  })
  if (error) {
    if (!performanceErrorToken(error)) {
      logDbError('performance.goal_submit', error, { employeeId: employee.id })
    }
    return { ok: false, error: performanceMessage(error) }
  }

  revalidatePath('/workspace/performance')
  return { ok: true, status: String(data ?? 'pending_approval') }
}

export async function decideGoalApproval(
  goalId: string,
  decision: 'approve' | 'reject' | 'request_changes',
  note?: string,
): Promise<ActionResult<{ status: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.goal.decide' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const isHr = await isHrActor()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('goal_decide_approval', {
    p_goal_id: goalId,
    p_manager_id: employee.id,
    p_decision: decision,
    p_note: note ?? null,
    p_is_hr: isHr,
  })
  if (error) {
    if (!performanceErrorToken(error)) {
      logDbError('performance.goal_decide', error, { employeeId: employee.id })
    }
    return { ok: false, error: performanceMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: `workspace.goal.${decision}`,
    summary: `Decided on a direct report's goal: ${decision.replace('_', ' ')}`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `goals:${goalId}`,
    metadata: { goalId, decision, asHr: isHr },
  })

  revalidatePath('/workspace/performance')
  return { ok: true, status: String(data ?? decision) }
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function saveReviewSection(
  sectionId: string,
  body: string,
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.review.write' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (body.length > 20000) return { ok: false, error: 'Keep it under 20000 characters.' }

  const isHr = await isHrActor()
  const supabase = createSupabaseAdminClient()

  const { data: section } = await supabase
    .from('review_sections')
    .select('review_id, visibility')
    .eq('id', sectionId)
    .maybeSingle<{ review_id: string; visibility: string }>()
  if (!section) return { ok: false, error: performanceMessage({ message: 'performance.review_not_found' }) }

  // Writing is checked separately from reading. A direct manager who is not the
  // named reviewer can open the review and cannot write in it.
  const { data: canEdit } = await supabase.rpc('performance_can_edit_review', {
    p_review_id: section.review_id,
    p_employee_id: employee.id,
    p_is_hr: isHr,
  })
  if (canEdit !== true) {
    return { ok: false, error: performanceMessage({ message: 'performance.not_reviewer' }) }
  }

  const { error } = await supabase
    .from('review_sections')
    .update({ body, author_employee_id: employee.id, updated_at: new Date().toISOString() })
    .eq('id', sectionId)
  if (error) {
    if (!performanceErrorToken(error)) {
      logDbError('performance.section_save', error, { employeeId: employee.id })
    }
    return { ok: false, error: performanceMessage(error) }
  }

  // A calibration note is the most sensitive text in the system, so writing one
  // is recorded whether or not anybody ever reads it.
  if (section.visibility === 'calibration_only') {
    void recordSensitiveWorkspaceAction({
      employeeId: employee.id,
      eventType: 'workspace.review.calibration_note',
      summary: 'Wrote a calibration note',
      actorEmployeeId: employee.id,
      actorClerkId: employee.clerkUserId,
      targetResource: `review_sections:${sectionId}`,
      metadata: { reviewId: section.review_id, visibility: section.visibility },
      severity: 'warn',
    })
  }

  revalidatePath('/workspace/performance')
  return { ok: true }
}

export async function setReviewRating(input: {
  reviewId: string
  competencyId?: string | null
  goalId?: string | null
  rating: number
  rationale: string
  changeReason?: string
}): Promise<ActionResult<{ ratingId: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.rating.set' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (!input.rationale?.trim()) {
    return { ok: false, error: performanceMessage({ message: 'performance.rationale_required' }) }
  }
  if (Boolean(input.competencyId) === Boolean(input.goalId)) {
    return { ok: false, error: performanceMessage({ message: 'performance.rating_subject_required' }) }
  }

  const isHr = await isHrActor()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('review_set_rating', {
    p_review_id: input.reviewId,
    p_employee_id: employee.id,
    p_competency_id: input.competencyId ?? null,
    p_goal_id: input.goalId ?? null,
    p_rating: input.rating,
    p_rationale: input.rationale.trim(),
    p_change_reason: input.changeReason?.trim() || null,
    // Never passed from the browser. The database derives it from the review's
    // kind and state, so a caller cannot label their own opinion as a
    // calibration outcome or an HR correction.
    p_source: null,
    p_is_hr: isHr,
  })
  if (error) {
    if (!performanceErrorToken(error)) {
      logDbError('performance.rating', error, { employeeId: employee.id })
    }
    return { ok: false, error: performanceMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: input.changeReason ? 'workspace.review.rating_changed' : 'workspace.review.rating_set',
    summary: input.changeReason ? 'Changed a performance rating' : 'Set a performance rating',
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `performance_reviews:${input.reviewId}`,
    // The rating VALUE is deliberately not in the metadata. This log is read by
    // more people than the review is.
    metadata: {
      reviewId: input.reviewId,
      subject: input.competencyId ? 'competency' : 'goal',
      isChange: Boolean(input.changeReason),
      asHr: isHr,
    },
    severity: 'warn',
  })

  revalidatePath('/workspace/performance')
  return { ok: true, ratingId: String(data) }
}

export async function submitReview(reviewId: string): Promise<ActionResult<{ state: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.review.submit' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const isHr = await isHrActor()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('review_submit', {
    p_review_id: reviewId,
    p_employee_id: employee.id,
    p_is_hr: isHr,
  })
  if (error) {
    if (!performanceErrorToken(error)) {
      logDbError('performance.review_submit', error, { employeeId: employee.id })
    }
    return { ok: false, error: performanceMessage(error) }
  }

  revalidatePath('/workspace/performance')
  return { ok: true, state: String(data ?? 'submitted') }
}

export async function finaliseReview(
  reviewId: string,
  overallRating: number | null,
  summary: string,
): Promise<ActionResult<{ state: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.review.finalise' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const isHr = await isHrActor()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('review_finalise', {
    p_review_id: reviewId,
    p_employee_id: employee.id,
    p_overall_rating: overallRating,
    p_summary: summary,
    p_is_hr: isHr,
  })
  if (error) {
    if (!performanceErrorToken(error)) {
      logDbError('performance.review_finalise', error, { employeeId: employee.id })
    }
    return { ok: false, error: performanceMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.review.finalised',
    summary: 'Finalised a performance review',
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `performance_reviews:${reviewId}`,
    metadata: { reviewId, hasOverallRating: overallRating !== null, asHr: isHr },
    severity: 'warn',
  })

  revalidatePath('/workspace/performance')
  return { ok: true, state: String(data ?? 'finalised') }
}

export async function acknowledgeReview(
  reviewId: string,
  note: string,
  disagrees: boolean,
): Promise<ActionResult<{ state: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.review.acknowledge' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (disagrees && !note.trim()) {
    return { ok: false, error: performanceMessage({ message: 'performance.disagreement_note_required' }) }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('review_acknowledge', {
    p_review_id: reviewId,
    p_employee_id: employee.id,
    p_note: note.trim() || null,
    p_disagrees: disagrees,
  })
  if (error) {
    if (!performanceErrorToken(error)) {
      logDbError('performance.review_acknowledge', error, { employeeId: employee.id })
    }
    return { ok: false, error: performanceMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.review.acknowledged',
    summary: disagrees
      ? 'Acknowledged their review and recorded a disagreement'
      : 'Acknowledged their review',
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `performance_reviews:${reviewId}`,
    metadata: { reviewId, disagrees },
  })

  revalidatePath('/workspace/performance')
  return { ok: true, state: String(data ?? 'acknowledged') }
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export async function requestFeedback(input: {
  respondentEmployeeId: string
  relationship: 'manager' | 'peer' | 'direct_report' | 'skip_level' | 'cross_functional'
  message?: string
  dueDate?: string | null
  cycleId?: string | null
  isAnonymous?: boolean
}): Promise<ActionResult<{ requestId: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.feedback.request' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (input.respondentEmployeeId === employee.id) {
    return { ok: false, error: 'You cannot ask yourself for feedback.' }
  }

  const supabase = createSupabaseAdminClient()
  const { data: created, error } = await supabase
    .from('feedback_requests')
    // The subject is ALWAYS the requester here. This action is "ask somebody
    // for feedback about me"; asking for feedback about a third party is a
    // manager action with different rules and is not this function.
    .insert({
      subject_employee_id: employee.id,
      respondent_employee_id: input.respondentEmployeeId,
      requested_by_employee_id: employee.id,
      cycle_id: input.cycleId ?? null,
      relationship: input.relationship,
      message: (input.message ?? '').slice(0, 5000),
      due_date: input.dueDate || null,
      is_anonymous: Boolean(input.isAnonymous),
      shared_with_subject: true,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single<{ id: string }>()

  if (error) {
    logDbError('performance.feedback_request', error, { employeeId: employee.id })
    return { ok: false, error: performanceMessage(error) }
  }

  revalidatePath('/workspace/performance')
  return { ok: true, requestId: created.id }
}

export async function respondToFeedback(input: {
  requestId: string
  strengths: string
  improvements: string
  overallScore?: number | null
}): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.feedback.respond' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (!input.strengths.trim() && !input.improvements.trim()) {
    return { ok: false, error: 'Write something in at least one of the two boxes.' }
  }

  const supabase = createSupabaseAdminClient()

  // Only the person who was ASKED may answer. Without this, a request id would
  // be enough to put words in somebody else's mouth.
  const { data: request } = await supabase
    .from('feedback_requests')
    .select('id, respondent_employee_id, status')
    .eq('id', input.requestId)
    .maybeSingle<{ id: string; respondent_employee_id: string | null; status: string }>()
  if (!request || request.respondent_employee_id !== employee.id) {
    return { ok: false, error: performanceMessage({ message: 'performance.feedback_not_permitted' }) }
  }
  if (request.status === 'submitted') {
    return { ok: false, error: 'You have already answered this one. Feedback cannot be edited.' }
  }

  const { error } = await supabase.from('feedback_responses').insert({
    request_id: input.requestId,
    author_employee_id: employee.id,
    strengths: input.strengths.slice(0, 10000),
    improvements: input.improvements.slice(0, 10000),
    overall_score: input.overallScore ?? null,
  })
  if (error) {
    logDbError('performance.feedback_respond', error, { employeeId: employee.id })
    return { ok: false, error: performanceMessage(error) }
  }

  await supabase
    .from('feedback_requests')
    .update({ status: 'submitted', responded_at: new Date().toISOString() })
    .eq('id', input.requestId)

  revalidatePath('/workspace/performance')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Development
// ---------------------------------------------------------------------------

export async function createDevelopmentAction(input: {
  title: string
  description?: string
  actionType?: string
  competencyId?: string | null
  targetDate?: string | null
  supportNeeded?: string
}): Promise<ActionResult<{ actionId: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.development.create' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const title = input.title.trim()
  if (title.length === 0) return { ok: false, error: 'Say what you are going to do.' }

  const supabase = createSupabaseAdminClient()
  const { data: created, error } = await supabase
    .from('development_actions')
    // Always their own. A development action is the one place somebody writes
    // down what they are not yet good at.
    .insert({
      employee_id: employee.id,
      title,
      description: (input.description ?? '').slice(0, 10000),
      action_type: input.actionType ?? 'on_the_job',
      competency_id: input.competencyId ?? null,
      target_date: input.targetDate || null,
      support_needed: input.supportNeeded ?? null,
      status: 'planned',
    })
    .select('id')
    .single<{ id: string }>()

  if (error) {
    logDbError('performance.development_create', error, { employeeId: employee.id })
    return { ok: false, error: performanceMessage(error) }
  }

  revalidatePath('/workspace/performance')
  return { ok: true, actionId: created.id }
}

export async function updateDevelopmentAction(
  actionId: string,
  status: 'planned' | 'in_progress' | 'completed' | 'abandoned' | 'blocked',
  progressNote?: string,
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'performance.development.update' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('development_actions')
    .update({
      status,
      progress_note: progressNote ?? '',
      completed_on: status === 'completed' ? new Date().toISOString().slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    })
    // Scoped by employee_id in the WHERE, not checked beforehand: an id from
    // somebody else's plan matches nothing rather than being updated.
    .eq('id', actionId)
    .eq('employee_id', employee.id)
    // Returning the row is the check that it matched. `count` is null unless
    // explicitly requested, so testing it would silently pass for everybody.
    .select('id')
    .returns<{ id: string }[]>()
  if (error) {
    logDbError('performance.development_update', error, { employeeId: employee.id })
    return { ok: false, error: performanceMessage(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'That development action is not available to you.' }
  }

  revalidatePath('/workspace/performance')
  return { ok: true }
}
