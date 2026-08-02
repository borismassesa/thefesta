import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import type { WorkspaceEmployee } from '@/lib/workspace/identity'
import type {
  ApprovalStatus,
  GoalLevel,
  GoalStatus,
  GoalVisibility,
  MeasurementMethod,
  MeasurementType,
} from './goals'
import type { CycleStage, ReviewKind, ReviewState } from './cycle'
import type { SectionVisibility } from './authorization'

// Performance reads, scoped to one employee.
//
// Reviews go through performance_can_view_review() and their sections through
// performance_visible_sections(). Neither is a filter applied afterwards: a
// section the reader is not entitled to is never returned by the database, so
// there is no shape in which a calibration note could reach this process and
// then reach a browser through an oversight in a later map().

export type CycleRow = {
  id: string
  code: string
  name: string
  description: string | null
  stage: CycleStage
  startsOn: string
  endsOn: string
  weightTotalRequired: number
  weightTolerance: number
  minGoals: number
  maxGoals: number | null
  ratingScaleMin: number
  ratingScaleMax: number
  ratingScaleLabels: { value: number; label: string; descriptor?: string }[]
}

export type KeyResultRow = {
  id: string
  goalId: string
  title: string
  measurementType: MeasurementType
  startValue: number
  targetValue: number | null
  currentValue: number
  direction: 'increase' | 'decrease'
  unit: string | null
  currency: string
  isAchieved: boolean
  weight: number
  milestones: { label: string; done: boolean }[]
}

export type GoalRow = {
  id: string
  reference: string | null
  title: string
  description: string
  level: GoalLevel
  parentGoalId: string | null
  parentTitle: string | null
  ownerEmployeeId: string | null
  ownerName: string | null
  department: string | null
  startDate: string | null
  dueDate: string | null
  weight: number
  status: GoalStatus
  visibility: GoalVisibility
  progress: number
  progressSource: 'manual' | 'key_results'
  measurementMethod: MeasurementMethod
  approvalStatus: ApprovalStatus
  approvalNote: string | null
  keyResults: KeyResultRow[]
  updateCount: number
}

export type ReviewRow = {
  id: string
  cycleId: string
  employeeId: string
  employeeName: string | null
  kind: ReviewKind
  reviewerEmployeeId: string | null
  reviewerName: string | null
  state: ReviewState
  overallRating: number | null
  overallRatingLabel: string | null
  summary: string
  acknowledgedAt: string | null
  acknowledgmentNote: string | null
  employeeDisagrees: boolean
  correctionReason: string | null
  finalisedAt: string | null
}

export type ReviewSectionRow = {
  id: string
  code: string
  title: string
  sectionType: string
  visibility: SectionVisibility
  body: string
  sortOrder: number
}

export type RatingRow = {
  id: string
  competencyId: string | null
  competencyName: string | null
  goalId: string | null
  goalTitle: string | null
  rating: number
  ratingLabel: string | null
  scaleMin: number
  scaleMax: number
  source: string
  rationale: string
  ratedByName: string | null
  changeReason: string | null
  supersededAt: string | null
  createdAt: string
}

export type FeedbackRow = {
  requestId: string
  relationship: string
  isAnonymous: boolean
  status: string
  respondentLabel: string
  strengths: string | null
  improvements: string | null
  overallScore: number | null
  submittedAt: string | null
}

export type CompetencyRow = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
}

export type DevelopmentActionRow = {
  id: string
  planId: string | null
  title: string
  description: string
  actionType: string
  competencyId: string | null
  competencyName: string | null
  targetDate: string | null
  status: string
  progressNote: string
  supportNeeded: string | null
  supportApproved: boolean | null
}

export type CheckInRow = {
  id: string
  kind: string
  scheduledFor: string | null
  heldAt: string | null
  status: string
  employeeNotes: string
  managerNotes: string
  agreedActions: string
  employeeSentiment: string | null
  managerName: string | null
}

export type EvidenceRow = {
  source: string
  refId: string | null
  occurredOn: string | null
  title: string
  detail: string | null
}

/** The cycle currently running, or the most recent one. */
export async function getCurrentCycle(): Promise<CycleRow | null> {
  if (!hasSupabaseAdminConfig()) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('performance_cycles')
      .select(
        'id, code, name, description, stage, starts_on, ends_on, weight_total_required, weight_tolerance, min_goals_per_employee, max_goals_per_employee, rating_scale_min, rating_scale_max, rating_scale_labels',
      )
      // An open cycle before a closed one, then most recent.
      .order('stage', { ascending: true })
      .order('starts_on', { ascending: false })
      .limit(10)
      .returns<Record<string, unknown>[]>()
    if (error) {
      logDbError('performance.cycle', error)
      return null
    }
    const rows = data ?? []
    const open = rows.find((r) => r.stage !== 'closed') ?? rows[0]
    if (!open) return null
    return {
      id: open.id as string,
      code: open.code as string,
      name: open.name as string,
      description: (open.description as string) ?? null,
      stage: open.stage as CycleStage,
      startsOn: open.starts_on as string,
      endsOn: open.ends_on as string,
      weightTotalRequired: Number(open.weight_total_required),
      weightTolerance: Number(open.weight_tolerance),
      minGoals: Number(open.min_goals_per_employee),
      maxGoals: open.max_goals_per_employee === null ? null : Number(open.max_goals_per_employee),
      ratingScaleMin: Number(open.rating_scale_min),
      ratingScaleMax: Number(open.rating_scale_max),
      ratingScaleLabels: (open.rating_scale_labels as CycleRow['ratingScaleLabels']) ?? [],
    }
  } catch (error) {
    logDbError('performance.cycle', error)
    return null
  }
}

type RawGoal = {
  id: string
  reference: string | null
  title: string
  description: string
  level: GoalLevel
  parent_goal_id: string | null
  owner_employee_id: string | null
  department: string | null
  start_date: string | null
  due_date: string | null
  weight: string | number
  status: GoalStatus
  visibility: GoalVisibility
  progress: string | number
  progress_source: 'manual' | 'key_results'
  measurement_method: MeasurementMethod
  approval_status: ApprovalStatus
  approval_note: string | null
  workforce_employees: { full_name: string } | null
}

const GOAL_COLUMNS =
  'id, reference, title, description, level, parent_goal_id, owner_employee_id, department, start_date, due_date, weight, status, visibility, progress, progress_source, measurement_method, approval_status, approval_note, workforce_employees!owner_employee_id(full_name)'

/**
 * Goals this employee may see.
 *
 * The candidate set is narrowed in SQL first (their own, plus the company and
 * brand goals everybody works against), then each one is confirmed by
 * goal_is_visible_to(). Slightly chattier; impossible to drift from the
 * database's answer.
 */
export async function getVisibleGoals(
  employee: WorkspaceEmployee,
  cycleId: string | null,
  isAdmin = false,
): Promise<GoalRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('goals')
      .select(GOAL_COLUMNS)
      .is('deleted_at', null)
      .order('level')
      .order('due_date', { nullsFirst: false })
      .limit(300)
    if (cycleId) query = query.eq('cycle_id', cycleId)

    const { data, error } = await query.returns<RawGoal[]>()
    if (error) {
      logDbError('performance.goals', error, { employeeId: employee.id })
      return []
    }

    const visible: RawGoal[] = []
    for (const goal of data ?? []) {
      const { data: ok } = await supabase.rpc('goal_is_visible_to', {
        p_goal_id: goal.id,
        p_employee_id: employee.id,
        p_is_admin: isAdmin,
      })
      if (ok === true) visible.push(goal)
    }
    if (visible.length === 0) return []

    const ids = visible.map((g) => g.id)
    const [krs, parents, updates] = await Promise.all([
      supabase
        .from('goal_key_results')
        .select(
          'id, goal_id, title, measurement_type, start_value, target_value, current_value, direction, unit, currency, is_achieved, weight, definition',
        )
        .in('goal_id', ids)
        .order('sort_order')
        .returns<Record<string, unknown>[]>(),
      supabase
        .from('goals')
        .select('id, title')
        .in('id', visible.map((g) => g.parent_goal_id).filter((v): v is string => Boolean(v)))
        .returns<{ id: string; title: string }[]>(),
      supabase.from('goal_updates').select('goal_id').in('goal_id', ids).returns<{ goal_id: string }[]>(),
    ])

    const krByGoal = new Map<string, KeyResultRow[]>()
    for (const row of krs.data ?? []) {
      const definition = (row.definition as { milestones?: { label: string; done: boolean }[] }) ?? {}
      const list = krByGoal.get(row.goal_id as string) ?? []
      list.push({
        id: row.id as string,
        goalId: row.goal_id as string,
        title: row.title as string,
        measurementType: row.measurement_type as MeasurementType,
        startValue: Number(row.start_value),
        targetValue: row.target_value === null ? null : Number(row.target_value),
        currentValue: Number(row.current_value),
        direction: row.direction as 'increase' | 'decrease',
        unit: (row.unit as string) ?? null,
        currency: (row.currency as string) ?? 'TZS',
        isAchieved: Boolean(row.is_achieved),
        weight: Number(row.weight),
        milestones: definition.milestones ?? [],
      })
      krByGoal.set(row.goal_id as string, list)
    }

    const parentTitles = new Map((parents.data ?? []).map((p) => [p.id, p.title]))
    const updateCounts = new Map<string, number>()
    for (const u of updates.data ?? []) {
      updateCounts.set(u.goal_id, (updateCounts.get(u.goal_id) ?? 0) + 1)
    }

    return visible.map((g) => ({
      id: g.id,
      reference: g.reference,
      title: g.title,
      description: g.description,
      level: g.level,
      parentGoalId: g.parent_goal_id,
      parentTitle: g.parent_goal_id ? (parentTitles.get(g.parent_goal_id) ?? null) : null,
      ownerEmployeeId: g.owner_employee_id,
      ownerName: g.workforce_employees?.full_name ?? null,
      department: g.department,
      startDate: g.start_date,
      dueDate: g.due_date,
      weight: Number(g.weight),
      status: g.status,
      visibility: g.visibility,
      progress: Number(g.progress),
      progressSource: g.progress_source,
      measurementMethod: g.measurement_method,
      approvalStatus: g.approval_status,
      approvalNote: g.approval_note,
      keyResults: krByGoal.get(g.id) ?? [],
      updateCount: updateCounts.get(g.id) ?? 0,
    }))
  } catch (error) {
    logDbError('performance.goals', error, { employeeId: employee.id })
    return []
  }
}

/** Goals of this employee's direct reports that are waiting on a decision. */
export async function getGoalsAwaitingMyApproval(
  employee: WorkspaceEmployee,
): Promise<GoalRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data: reports } = await supabase
      .from('workforce_employees')
      .select('id')
      .eq('manager_id', employee.id)
      .returns<{ id: string }[]>()
    const reportIds = (reports ?? []).map((r) => r.id)
    if (reportIds.length === 0) return []

    const { data, error } = await supabase
      .from('goals')
      .select(GOAL_COLUMNS)
      .in('owner_employee_id', reportIds)
      .eq('approval_status', 'pending_approval')
      .is('deleted_at', null)
      .returns<RawGoal[]>()
    if (error) {
      logDbError('performance.approval_queue', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((g) => ({
      id: g.id,
      reference: g.reference,
      title: g.title,
      description: g.description,
      level: g.level,
      parentGoalId: g.parent_goal_id,
      parentTitle: null,
      ownerEmployeeId: g.owner_employee_id,
      ownerName: g.workforce_employees?.full_name ?? null,
      department: g.department,
      startDate: g.start_date,
      dueDate: g.due_date,
      weight: Number(g.weight),
      status: g.status,
      visibility: g.visibility,
      progress: Number(g.progress),
      progressSource: g.progress_source,
      measurementMethod: g.measurement_method,
      approvalStatus: g.approval_status,
      approvalNote: g.approval_note,
      keyResults: [],
      updateCount: 0,
    }))
  } catch (error) {
    logDbError('performance.approval_queue', error, { employeeId: employee.id })
    return []
  }
}

/** Reviews this employee may open: their own, plus their direct reports'. */
export async function getMyReviews(
  employee: WorkspaceEmployee,
  cycleId: string | null,
  isHr = false,
): Promise<ReviewRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('performance_reviews')
      .select(
        'id, cycle_id, employee_id, kind, reviewer_employee_id, state, overall_rating, overall_rating_label, summary, acknowledged_at, acknowledgment_note, employee_disagrees, correction_reason, finalised_at, subject:workforce_employees!employee_id(full_name), reviewer:workforce_employees!reviewer_employee_id(full_name)',
      )
      .limit(200)
    if (cycleId) query = query.eq('cycle_id', cycleId)

    // The candidate set is already narrowed to rows that name this employee, so
    // a review of somebody unrelated is not fetched and then discarded.
    if (!isHr) {
      const { data: reports } = await supabase
        .from('workforce_employees')
        .select('id')
        .eq('manager_id', employee.id)
        .returns<{ id: string }[]>()
      const ids = [employee.id, ...(reports ?? []).map((r) => r.id)]
      query = query.or(
        `employee_id.in.(${ids.join(',')}),reviewer_employee_id.eq.${employee.id}`,
      )
    }

    const { data, error } = await query.returns<Record<string, unknown>[]>()
    if (error) {
      logDbError('performance.reviews', error, { employeeId: employee.id })
      return []
    }

    // Confirmed one by one against the database's own rule. The narrowing above
    // is an optimisation; THIS is the authorization.
    const out: ReviewRow[] = []
    for (const r of data ?? []) {
      const { data: ok } = await supabase.rpc('performance_can_view_review', {
        p_review_id: r.id as string,
        p_employee_id: employee.id,
        p_is_hr: isHr,
      })
      if (ok !== true) continue
      out.push({
        id: r.id as string,
        cycleId: r.cycle_id as string,
        employeeId: r.employee_id as string,
        employeeName: (r.subject as { full_name: string } | null)?.full_name ?? null,
        kind: r.kind as ReviewKind,
        reviewerEmployeeId: (r.reviewer_employee_id as string) ?? null,
        reviewerName: (r.reviewer as { full_name: string } | null)?.full_name ?? null,
        state: r.state as ReviewState,
        overallRating: r.overall_rating === null ? null : Number(r.overall_rating),
        overallRatingLabel: (r.overall_rating_label as string) ?? null,
        summary: (r.summary as string) ?? '',
        acknowledgedAt: (r.acknowledged_at as string) ?? null,
        acknowledgmentNote: (r.acknowledgment_note as string) ?? null,
        employeeDisagrees: Boolean(r.employee_disagrees),
        correctionReason: (r.correction_reason as string) ?? null,
        finalisedAt: (r.finalised_at as string) ?? null,
      })
    }
    return out
  } catch (error) {
    logDbError('performance.reviews', error, { employeeId: employee.id })
    return []
  }
}

/**
 * The sections of a review this reader may see.
 *
 * Goes through performance_visible_sections(), which drops calibration notes
 * for the subject inside the database. Nothing filters afterwards, because a
 * calibration note that reaches this process is already one serialisation
 * mistake away from a browser.
 */
export async function getReviewSections(
  reviewId: string,
  employee: WorkspaceEmployee,
  isHr = false,
): Promise<ReviewSectionRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc('performance_visible_sections', {
      p_review_id: reviewId,
      p_employee_id: employee.id,
      p_is_hr: isHr,
    })
    if (error) {
      logDbError('performance.sections', error, { employeeId: employee.id })
      return []
    }
    return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      code: row.code as string,
      title: row.title as string,
      sectionType: row.section_type as string,
      visibility: row.visibility as SectionVisibility,
      body: (row.body as string) ?? '',
      sortOrder: Number(row.sort_order),
    }))
  } catch (error) {
    logDbError('performance.sections', error, { employeeId: employee.id })
    return []
  }
}

/** Every rating on a review, superseded ones included. That IS the audit trail. */
export async function getReviewRatings(
  reviewId: string,
  employee: WorkspaceEmployee,
  isHr = false,
): Promise<RatingRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data: ok } = await supabase.rpc('performance_can_view_review', {
      p_review_id: reviewId,
      p_employee_id: employee.id,
      p_is_hr: isHr,
    })
    if (ok !== true) return []

    const { data, error } = await supabase
      .from('review_ratings')
      .select(
        'id, competency_id, goal_id, rating, rating_label, scale_min, scale_max, source, rationale, change_reason, superseded_at, created_at, competencies(name), goals(title), workforce_employees!rated_by_employee_id(full_name)',
      )
      .eq('review_id', reviewId)
      .order('created_at', { ascending: false })
      .returns<Record<string, unknown>[]>()
    if (error) {
      logDbError('performance.ratings', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      competencyId: (r.competency_id as string) ?? null,
      competencyName: (r.competencies as { name: string } | null)?.name ?? null,
      goalId: (r.goal_id as string) ?? null,
      goalTitle: (r.goals as { title: string } | null)?.title ?? null,
      rating: Number(r.rating),
      ratingLabel: (r.rating_label as string) ?? null,
      scaleMin: Number(r.scale_min),
      scaleMax: Number(r.scale_max),
      source: r.source as string,
      rationale: r.rationale as string,
      ratedByName: (r.workforce_employees as { full_name: string } | null)?.full_name ?? null,
      changeReason: (r.change_reason as string) ?? null,
      supersededAt: (r.superseded_at as string) ?? null,
      createdAt: r.created_at as string,
    }))
  } catch (error) {
    logDbError('performance.ratings', error, { employeeId: employee.id })
    return []
  }
}

/** Feedback about one person, with anonymity applied by the database. */
export async function getFeedback(
  subjectEmployeeId: string,
  viewer: WorkspaceEmployee,
  cycleId: string | null,
  isHr = false,
): Promise<FeedbackRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc('feedback_for_subject', {
      p_subject_employee_id: subjectEmployeeId,
      p_viewer_employee_id: viewer.id,
      p_cycle_id: cycleId,
      p_is_hr: isHr,
    })
    if (error) {
      // Not permitted is an expected outcome here, not a fault worth logging
      // with a stack.
      return []
    }
    return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
      requestId: row.request_id as string,
      relationship: row.relationship as string,
      isAnonymous: Boolean(row.is_anonymous),
      status: row.status as string,
      respondentLabel: row.respondent_label as string,
      strengths: (row.strengths as string) ?? null,
      improvements: (row.improvements as string) ?? null,
      overallScore: row.overall_score === null ? null : Number(row.overall_score),
      submittedAt: (row.submitted_at as string) ?? null,
    }))
  } catch {
    return []
  }
}

/** Requests addressed to this employee that they have not answered. */
export async function getFeedbackAskedOfMe(
  employee: WorkspaceEmployee,
): Promise<{ id: string; subjectName: string | null; relationship: string; dueDate: string | null }[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('feedback_requests')
      .select('id, relationship, due_date, workforce_employees!subject_employee_id(full_name)')
      .eq('respondent_employee_id', employee.id)
      .in('status', ['pending', 'sent'])
      .order('due_date', { nullsFirst: false })
      .returns<Record<string, unknown>[]>()
    if (error) {
      logDbError('performance.feedback_inbox', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      subjectName: (r.workforce_employees as { full_name: string } | null)?.full_name ?? null,
      relationship: r.relationship as string,
      dueDate: (r.due_date as string) ?? null,
    }))
  } catch (error) {
    logDbError('performance.feedback_inbox', error, { employeeId: employee.id })
    return []
  }
}

export async function getCompetencies(): Promise<CompetencyRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('competencies')
      .select('id, code, name, description, category')
      .eq('is_active', true)
      .order('sort_order')
      .returns<CompetencyRow[]>()
    return data ?? []
  } catch {
    return []
  }
}

export async function getDevelopmentActions(
  employee: WorkspaceEmployee,
): Promise<DevelopmentActionRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('development_actions')
      .select(
        'id, plan_id, title, description, action_type, competency_id, target_date, status, progress_note, support_needed, support_approved, competencies(name)',
      )
      // Only their own. A development plan is the one place somebody writes
      // down what they are bad at, and it is not management reporting.
      .eq('employee_id', employee.id)
      .order('target_date', { nullsFirst: false })
      .returns<Record<string, unknown>[]>()
    if (error) {
      logDbError('performance.development', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((a) => ({
      id: a.id as string,
      planId: (a.plan_id as string) ?? null,
      title: a.title as string,
      description: (a.description as string) ?? '',
      actionType: a.action_type as string,
      competencyId: (a.competency_id as string) ?? null,
      competencyName: (a.competencies as { name: string } | null)?.name ?? null,
      targetDate: (a.target_date as string) ?? null,
      status: a.status as string,
      progressNote: (a.progress_note as string) ?? '',
      supportNeeded: (a.support_needed as string) ?? null,
      supportApproved: a.support_approved === null ? null : Boolean(a.support_approved),
    }))
  } catch (error) {
    logDbError('performance.development', error, { employeeId: employee.id })
    return []
  }
}

export async function getCheckIns(
  employee: WorkspaceEmployee,
  cycleId: string | null,
): Promise<CheckInRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('check_ins')
      .select(
        'id, kind, scheduled_for, held_at, status, employee_notes, manager_notes, agreed_actions, employee_sentiment, workforce_employees!manager_employee_id(full_name)',
      )
      .eq('employee_id', employee.id)
      .order('scheduled_for', { ascending: false, nullsFirst: false })
      .limit(20)
    if (cycleId) query = query.eq('cycle_id', cycleId)

    const { data, error } = await query.returns<Record<string, unknown>[]>()
    if (error) {
      logDbError('performance.checkins', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((c) => ({
      id: c.id as string,
      kind: c.kind as string,
      scheduledFor: (c.scheduled_for as string) ?? null,
      heldAt: (c.held_at as string) ?? null,
      status: c.status as string,
      employeeNotes: (c.employee_notes as string) ?? '',
      managerNotes: (c.manager_notes as string) ?? '',
      agreedActions: (c.agreed_actions as string) ?? '',
      employeeSentiment: (c.employee_sentiment as string) ?? null,
      managerName: (c.workforce_employees as { full_name: string } | null)?.full_name ?? null,
    }))
  } catch (error) {
    logDbError('performance.checkins', error, { employeeId: employee.id })
    return []
  }
}

/**
 * What somebody actually did in a window.
 *
 * Returns links for a human to read. There is deliberately no companion
 * function that turns this into a suggested rating: a number on the screen next
 * to the rating box IS the rating, whatever it is labelled.
 */
export async function getEvidence(
  subjectEmployeeId: string,
  viewer: WorkspaceEmployee,
  from: string,
  to: string,
  isHr = false,
): Promise<EvidenceRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc('performance_evidence', {
      p_employee_id: subjectEmployeeId,
      p_viewer_employee_id: viewer.id,
      p_from: from,
      p_to: to,
      p_is_hr: isHr,
    })
    if (error) return []
    return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
      source: row.source as string,
      refId: (row.ref_id as string) ?? null,
      occurredOn: (row.occurred_on as string) ?? null,
      title: row.title as string,
      detail: (row.detail as string) ?? null,
    }))
  } catch {
    return []
  }
}
