import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import type { WorkspaceEmployee } from '@/lib/workspace/identity'
import type { TrackerStatus, ReviewStatus } from './status'
import { aggregateWeek, parseKpiMovement, type KpiMovement, type WeeklyAggregate } from './weekly'
import type { TrackerItem } from './carryover'

// Tracker reads, scoped to one employee.
//
// "Employees only see tracking units assigned to them" is enforced here and
// nowhere else. Every function takes the resolved WorkspaceEmployee and starts
// from tracking_assignments: a unit nobody assigned to you is a unit you cannot
// name, so there is no id to guess. RLS is off on these tables (service-role
// client), which is exactly why the scoping has to be in the signature.

export type TrackingUnit = {
  id: string
  kind: 'employee' | 'team' | 'department' | 'brand' | 'project' | 'initiative'
  slug: string
  name: string
  description: string | null
  ownerEmployeeId: string | null
  /** The caller's role on this unit. Decides what they may do with it. */
  role: 'owner' | 'contributor' | 'reviewer'
}

export type TrackerEntry = {
  id: string
  cycleId: string
  unitId: string
  unitName: string
  unitKind: string
  employeeId: string
  entryDate: string
  status: TrackerStatus
  progressSummary: string
  blockers: string
  blockerOwnerEmployeeId: string | null
  expectedResolutionDate: string | null
  decisionsRequired: string
  nextSteps: string
  deadlineAt: string | null
  submittedAt: string | null
  isLate: boolean
  suppressionReason: string | null
  reviewStatus: ReviewStatus
  returnedCount: number
  version: number
  loggedMinutes: number
  prefillSources: string[]
  unavailableSources: string[]
}

export type TrackerReviewEntry = {
  id: string
  action: string
  fromStatus: string | null
  toStatus: string | null
  note: string | null
  createdAt: string
  reviewerName: string | null
  hasSnapshot: boolean
}

export type TrackerComment = {
  id: string
  body: string
  authorName: string
  visibility: 'all' | 'internal'
  createdAt: string
}

export type EntryDetail = {
  entry: TrackerEntry
  items: TrackerItem[]
  reviews: TrackerReviewEntry[]
  comments: TrackerComment[]
  isOwner: boolean
  canReview: boolean
}

export type WeeklySummary = {
  id: string
  cycleId: string
  unitId: string
  unitName: string
  weekStart: string
  weekEnd: string
  wins: string
  missedCommitments: string
  carriedForward: string
  keyBlockers: string
  risks: string
  decisionsRequired: string
  nextWeekPriorities: string
  kpiMovement: KpiMovement[]
  aggregate: WeeklyAggregate | null
  status: string
  managerComment: string | null
  executiveComment: string | null
  submittedAt: string | null
}

const ENTRY_COLUMNS =
  'id, cycle_id, unit_id, employee_id, entry_date, status, progress_summary, blockers, blocker_owner_employee_id, expected_resolution_date, decisions_required, next_steps, deadline_at, submitted_at, is_late, suppression_reason, review_status, returned_count, version, prefill, tracking_units(name, kind)'

type EntryRow = {
  id: string
  cycle_id: string
  unit_id: string
  employee_id: string
  entry_date: string
  status: TrackerStatus
  progress_summary: string
  blockers: string
  blocker_owner_employee_id: string | null
  expected_resolution_date: string | null
  decisions_required: string
  next_steps: string
  deadline_at: string | null
  submitted_at: string | null
  is_late: boolean
  suppression_reason: string | null
  review_status: ReviewStatus
  returned_count: number
  version: number
  prefill: Record<string, unknown> | null
  tracking_units: { name: string; kind: string } | null
}

function mapEntry(row: EntryRow): TrackerEntry {
  const prefill = row.prefill ?? {}
  return {
    id: row.id,
    cycleId: row.cycle_id,
    unitId: row.unit_id,
    unitName: row.tracking_units?.name ?? 'Unit',
    unitKind: row.tracking_units?.kind ?? 'employee',
    employeeId: row.employee_id,
    entryDate: row.entry_date,
    status: row.status,
    progressSummary: row.progress_summary,
    blockers: row.blockers,
    blockerOwnerEmployeeId: row.blocker_owner_employee_id,
    expectedResolutionDate: row.expected_resolution_date,
    decisionsRequired: row.decisions_required,
    nextSteps: row.next_steps,
    deadlineAt: row.deadline_at,
    submittedAt: row.submitted_at,
    isLate: row.is_late,
    suppressionReason: row.suppression_reason,
    reviewStatus: row.review_status,
    returnedCount: row.returned_count,
    version: row.version,
    loggedMinutes: Number(prefill.logged_minutes ?? 0),
    prefillSources: Array.isArray(prefill.sources) ? (prefill.sources as string[]) : [],
    unavailableSources: Array.isArray(prefill.unavailable_sources)
      ? (prefill.unavailable_sources as string[])
      : [],
  }
}

type ItemRow = {
  id: string
  entry_id: string
  kind: TrackerItem['kind']
  title: string
  detail: string
  status: TrackerStatus
  sort_order: number
  linked_task_id: string | null
  linked_project_id: string | null
  linked_goal_id: string | null
  source: string
  carried_from_item_id: string | null
  carry_count: number
}

function mapItem(row: ItemRow): TrackerItem {
  return {
    id: row.id,
    entryId: row.entry_id,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    status: row.status,
    sortOrder: row.sort_order,
    linkedTaskId: row.linked_task_id,
    linkedProjectId: row.linked_project_id,
    linkedGoalId: row.linked_goal_id,
    source: row.source,
    carriedFromItemId: row.carried_from_item_id,
    carryCount: row.carry_count,
  }
}

/**
 * True when this employee is a Managing Director (or acting MD) for a brand.
 */
export async function isManagingDirector(employee: WorkspaceEmployee): Promise<boolean> {
  if (!hasSupabaseAdminConfig()) return false
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc('tracker_is_managing_director', {
      p_employee_id: employee.id,
    })
    if (error) {
      logDbError('tracker.is_md', error, { employeeId: employee.id })
      return false
    }
    return Boolean(data)
  } catch (error) {
    logDbError('tracker.is_md', error, { employeeId: employee.id })
    return false
  }
}

/**
 * Ensures brand owner assignments + today's MD entry exist. No-op for non-MDs.
 */
export async function ensureMyTrackerUnit(employee: WorkspaceEmployee): Promise<void> {
  if (!hasSupabaseAdminConfig()) return
  try {
    const supabase = createSupabaseAdminClient()
    const { error: unitError } = await supabase.rpc('tracker_ensure_employee_unit', {
      p_employee_id: employee.id,
    })
    if (unitError) {
      logDbError('tracker.ensure_unit', unitError, { employeeId: employee.id })
      return
    }
    const { error: entryError } = await supabase.rpc('tracker_ensure_today_entry', {
      p_employee_id: employee.id,
    })
    if (entryError) {
      logDbError('tracker.ensure_today', entryError, { employeeId: employee.id })
    }
  } catch (error) {
    logDbError('tracker.ensure_unit', error, { employeeId: employee.id })
  }
}

/**
 * The units this Managing Director is assigned to, with the role they hold.
 *
 * Daily Tracker is MD-scoped: brand units they own, plus any reviewer units.
 * Prefill pulls department / assigned-task work onto those brand days.
 */
export async function getMyUnits(employee: WorkspaceEmployee): Promise<TrackingUnit[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('tracking_assignments')
      .select(
        'role, unit_id, tracking_units(id, kind, slug, name, description, owner_employee_id, is_active)',
      )
      .eq('employee_id', employee.id)
      .eq('is_active', true)
      .lte('effective_from', today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .returns<
        {
          role: TrackingUnit['role']
          unit_id: string
          tracking_units: {
            id: string
            kind: TrackingUnit['kind']
            slug: string
            name: string
            description: string | null
            owner_employee_id: string | null
            is_active: boolean
          } | null
        }[]
      >()
    if (error) {
      logDbError('tracker.units', error, { employeeId: employee.id })
      return []
    }
    const units: TrackingUnit[] = []
    for (const row of data ?? []) {
      const unit = row.tracking_units
      if (!unit || !unit.is_active) continue
      units.push({
        id: unit.id,
        kind: unit.kind,
        slug: unit.slug,
        name: unit.name,
        description: unit.description,
        ownerEmployeeId: unit.owner_employee_id,
        role: row.role,
      })
    }
    return units
  } catch (error) {
    logDbError('tracker.units', error, { employeeId: employee.id })
    return []
  }
}

/** Entries for the caller's units in a date range. */
export async function getMyEntries(
  employee: WorkspaceEmployee,
  from: string,
  to: string,
): Promise<TrackerEntry[]> {
  const units = await getMyUnits(employee)
  if (units.length === 0) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('tracker_entries')
      .select(ENTRY_COLUMNS)
      .in(
        'unit_id',
        units.map((u) => u.id),
      )
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: false })
      .returns<EntryRow[]>()
    if (error) {
      logDbError('tracker.entries', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map(mapEntry)
  } catch (error) {
    logDbError('tracker.entries', error, { employeeId: employee.id })
    return []
  }
}

/**
 * One entry with its items and history.
 *
 * Returns null unless the caller is assigned to the unit. Not "returns an
 * error": an unauthorized id should look the same as one that does not exist.
 */
export async function getEntryDetail(
  employee: WorkspaceEmployee,
  entryId: string,
  options: { asAdmin?: boolean } = {},
): Promise<EntryDetail | null> {
  if (!hasSupabaseAdminConfig()) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data: row, error } = await supabase
      .from('tracker_entries')
      .select(ENTRY_COLUMNS)
      .eq('id', entryId)
      .maybeSingle<EntryRow>()
    if (error) {
      logDbError('tracker.entry', error, { employeeId: employee.id })
      return null
    }
    if (!row) return null

    const units = await getMyUnits(employee)
    const assignment = units.find((u) => u.id === row.unit_id)
    if (!assignment && !options.asAdmin) return null

    const isOwner = row.employee_id === employee.id
    const canReview =
      Boolean(options.asAdmin) || assignment?.role === 'reviewer' || (!isOwner && Boolean(assignment))

    const [items, reviews, comments] = await Promise.all([
      supabase
        .from('tracker_entry_items')
        .select(
          'id, entry_id, kind, title, detail, status, sort_order, linked_task_id, linked_project_id, linked_goal_id, source, carried_from_item_id, carry_count',
        )
        .eq('entry_id', entryId)
        .order('sort_order')
        .returns<ItemRow[]>(),
      supabase
        .from('tracker_reviews')
        .select(
          'id, action, from_status, to_status, note, created_at, entry_snapshot, workforce_employees!reviewer_employee_id(full_name)',
        )
        .eq('entry_id', entryId)
        .order('created_at', { ascending: false })
        .returns<
          {
            id: string
            action: string
            from_status: string | null
            to_status: string | null
            note: string | null
            created_at: string
            entry_snapshot: unknown
            workforce_employees: { full_name: string } | null
          }[]
        >(),
      supabase
        .from('tracker_comments')
        .select('id, body, author_name, visibility, created_at')
        .eq('entry_id', entryId)
        .order('created_at')
        .returns<
          {
            id: string
            body: string
            author_name: string
            visibility: 'all' | 'internal'
            created_at: string
          }[]
        >(),
    ])

    return {
      entry: mapEntry(row),
      items: (items.data ?? []).map(mapItem),
      reviews: (reviews.data ?? []).map((r) => ({
        id: r.id,
        action: r.action,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        note: r.note,
        createdAt: r.created_at,
        reviewerName: r.workforce_employees?.full_name ?? null,
        // The snapshot itself is not sent to the browser: it is a full copy of
        // the entry, and the history only needs to say that one exists.
        hasSnapshot: r.entry_snapshot !== null && r.entry_snapshot !== undefined,
      })),
      // Internal notes are reviewer-only. Filtered here so no future component
      // can render them to the author by accident.
      comments: (comments.data ?? [])
        .filter((c) => c.visibility === 'all' || !isOwner)
        .map((c) => ({
          id: c.id,
          body: c.body,
          authorName: c.author_name,
          visibility: c.visibility,
          createdAt: c.created_at,
        })),
      isOwner,
      canReview,
    }
  } catch (error) {
    logDbError('tracker.entry', error, { employeeId: employee.id })
    return null
  }
}

/**
 * Items for a set of entries, scoped through the caller's assignments.
 *
 * Takes entry ids, but every one of them must belong to a unit the caller is
 * assigned to: the ids are re-checked against getMyUnits rather than trusted,
 * so passing somebody else's entry id returns nothing.
 */
export async function getItemsForEntries(
  employee: WorkspaceEmployee,
  entryIds: string[],
): Promise<Map<string, TrackerItem[]>> {
  const byEntry = new Map<string, TrackerItem[]>()
  if (entryIds.length === 0 || !hasSupabaseAdminConfig()) return byEntry
  try {
    const supabase = createSupabaseAdminClient()
    const units = await getMyUnits(employee)
    if (units.length === 0) return byEntry

    const { data: rows, error: rowsError } = await supabase
      .from('tracker_entry_items')
      .select(
        'id, entry_id, kind, title, detail, status, sort_order, linked_task_id, linked_project_id, linked_goal_id, source, carried_from_item_id, carry_count',
      )
      .in('entry_id', entryIds)
      .order('sort_order')
      .returns<ItemRow[]>()
    if (rowsError) {
      logDbError('tracker.items', rowsError, { employeeId: employee.id })
      return byEntry
    }

    // Confirm each entry belongs to one of the caller's units before returning
    // any of its items.
    const { data: owned } = await supabase
      .from('tracker_entries')
      .select('id, unit_id')
      .in('id', entryIds)
      .returns<{ id: string; unit_id: string }[]>()
    const unitIds = new Set(units.map((u) => u.id))
    const allowed = new Set(
      (owned ?? []).filter((e) => unitIds.has(e.unit_id)).map((e) => e.id),
    )

    for (const row of rows ?? []) {
      if (!allowed.has(row.entry_id)) continue
      const list = byEntry.get(row.entry_id) ?? []
      list.push(mapItem(row))
      byEntry.set(row.entry_id, list)
    }
    return byEntry
  } catch (error) {
    logDbError('tracker.items', error, { employeeId: employee.id })
    return byEntry
  }
}

/** Weekly summaries for the caller's units. */
export async function getMyWeeklySummaries(
  employee: WorkspaceEmployee,
  limit = 12,
): Promise<WeeklySummary[]> {
  const units = await getMyUnits(employee)
  if (units.length === 0) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('weekly_summaries')
      .select(
        'id, cycle_id, unit_id, week_start, week_end, wins, missed_commitments, carried_forward, key_blockers, risks, decisions_required, next_week_priorities, kpi_movement, aggregate, status, manager_comment, executive_comment, submitted_at, tracking_units(name)',
      )
      .in(
        'unit_id',
        units.map((u) => u.id),
      )
      .order('week_start', { ascending: false })
      .limit(limit)
      .returns<
        {
          id: string
          cycle_id: string
          unit_id: string
          week_start: string
          week_end: string
          wins: string
          missed_commitments: string
          carried_forward: string
          key_blockers: string
          risks: string
          decisions_required: string
          next_week_priorities: string
          kpi_movement: unknown
          aggregate: Record<string, unknown> | null
          status: string
          manager_comment: string | null
          executive_comment: string | null
          submitted_at: string | null
          tracking_units: { name: string } | null
        }[]
      >()
    if (error) {
      logDbError('tracker.weekly', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      cycleId: row.cycle_id,
      unitId: row.unit_id,
      unitName: row.tracking_units?.name ?? 'Unit',
      weekStart: row.week_start,
      weekEnd: row.week_end,
      wins: row.wins,
      missedCommitments: row.missed_commitments,
      carriedForward: row.carried_forward,
      keyBlockers: row.key_blockers,
      risks: row.risks,
      decisionsRequired: row.decisions_required,
      nextWeekPriorities: row.next_week_priorities,
      kpiMovement: parseKpiMovement(row.kpi_movement),
      aggregate: mapAggregate(row.aggregate),
      status: row.status,
      managerComment: row.manager_comment,
      executiveComment: row.executive_comment,
      submittedAt: row.submitted_at,
    }))
  } catch (error) {
    logDbError('tracker.weekly', error, { employeeId: employee.id })
    return []
  }
}

/**
 * Read the stored aggregate into the same shape aggregateWeek produces.
 *
 * The SQL and the TypeScript compute the same numbers; this is the boundary
 * where the stored jsonb becomes typed, and an absent aggregate becomes null
 * rather than a row of zeroes that reads as real data.
 */
function mapAggregate(value: Record<string, unknown> | null): WeeklyAggregate | null {
  if (!value || Object.keys(value).length === 0) return null
  const n = (key: string) => Number(value[key] ?? 0)
  const workingDays = n('working_days')
  const submitted = n('entries_submitted')
  return {
    entriesTotal: n('entries_total'),
    workingDays,
    entriesDone: n('entries_done'),
    entriesBlocked: n('entries_blocked'),
    entriesMissed: n('entries_missed'),
    entriesCarriedOver: n('entries_carried_over'),
    entriesNotWorking: n('entries_not_working'),
    entriesWaived: n('entries_waived'),
    entriesSubmitted: submitted,
    entriesLate: n('entries_late'),
    itemsCompleted: n('items_completed'),
    itemsCarried: n('items_carried'),
    blockersOpen: n('blockers_open'),
    loggedMinutes: n('logged_minutes'),
    completionPercent: workingDays === 0 ? 0 : Math.round((submitted / workingDays) * 100),
  }
}

/** Entries waiting on this employee as a reviewer. */
export async function getReviewQueue(employee: WorkspaceEmployee): Promise<TrackerEntry[]> {
  const units = (await getMyUnits(employee)).filter((u) => u.role === 'reviewer')
  if (units.length === 0) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('tracker_entries')
      .select(ENTRY_COLUMNS)
      .in(
        'unit_id',
        units.map((u) => u.id),
      )
      .not('submitted_at', 'is', null)
      .in('review_status', ['pending', 'under_review'])
      .order('submitted_at', { ascending: true })
      .limit(50)
      .returns<EntryRow[]>()
    if (error) {
      logDbError('tracker.review_queue', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map(mapEntry)
  } catch (error) {
    logDbError('tracker.review_queue', error, { employeeId: employee.id })
    return []
  }
}

/** Recompute a week's aggregate in TypeScript, for the live preview. */
export function aggregateEntries(entries: TrackerEntry[]): WeeklyAggregate {
  return aggregateWeek(
    entries.map((e) => ({
      entryDate: e.entryDate,
      status: e.status,
      submittedAt: e.submittedAt,
      isLate: e.isLate,
      suppressionReason: e.suppressionReason,
      loggedMinutes: e.loggedMinutes,
    })),
  )
}
