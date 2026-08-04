import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { narrowEmployeeFilter } from '@/lib/workforce/approvals'
import { getCallerScope } from '@/lib/workforce/identity'
import type { CurrentlyClockedEmployee, TimePunch } from '../../_lib/types'
import {
  ATTENDANCE_READ_KEYS,
  attendanceReadScope,
  canCorrectAttendance,
} from './attendance-scope'

// Team-scoped attendance reads.
//
// Scope is resolved before the query and applied as an `.in()` filter, so a
// manager's view is narrowed in the DATABASE. Fetching every punch in the
// company and discarding rows here would put the whole workforce's attendance
// pattern in a process that has no right to it, and attendance is more
// revealing than it looks: it exposes working hours, absence, lateness and
// habits for everyone.

type PunchRow = {
  id: string
  employee_id: string
  punch_at: string
  punch_type: 'in' | 'out'
  source: TimePunch['source']
  note: string | null
  location_label: string | null
  created_by_clerk_id: string | null
}

function mapPunch(r: PunchRow): TimePunch {
  return {
    id: r.id,
    employeeId: r.employee_id,
    punchAt: r.punch_at,
    type: r.punch_type,
    source: r.source,
    note: r.note,
    locationLabel: r.location_label,
    createdByClerkId: r.created_by_clerk_id,
  }
}

const PUNCH_COLUMNS =
  'id, employee_id, punch_at, punch_type, source, note, location_label, created_by_clerk_id'

export type ScopedAttendance = {
  punches: TimePunch[]
  currentlyClocked: CurrentlyClockedEmployee[]
  /** Employee ids the caller may see. null means organisation-wide. */
  visibleEmployeeIds: string[] | null
  isOrgScope: boolean
  isEmptyTeam: boolean
  /** Insert / edit / delete punches. Org-only, never implied by team scope. */
  canCorrect: boolean
}

/**
 * Attendance for a week, scoped to the caller.
 *
 * `requestedEmployeeIds` is a presentation filter and can only NARROW. Date
 * range is orthogonal: it never affects which employees are visible, so a
 * crafted week cannot be used to reach someone out of scope.
 */
export async function getScopedAttendance(
  rangeStartIso: string,
  rangeEndIsoExclusive: string,
  requestedEmployeeIds: string[] | null = null,
): Promise<ScopedAttendance> {
  const scope = await getCallerScope()
  const read = attendanceReadScope(scope)
  const canCorrect = canCorrectAttendance(scope)

  if (read.kind === 'none') {
    return {
      punches: [],
      currentlyClocked: [],
      visibleEmployeeIds: [],
      isOrgScope: false,
      isEmptyTeam: true,
      canCorrect,
    }
  }

  const narrowed = narrowEmployeeFilter(
    scope,
    requestedEmployeeIds,
    ATTENDANCE_READ_KEYS[0],
  )
  const ids = narrowed.scopeAll
    ? read.kind === 'team'
      ? read.employeeIds
      : null
    : narrowed.employeeIds

  // An intersection that empties out returns nothing, not everything.
  if (ids !== null && ids.length === 0) {
    return {
      punches: [],
      currentlyClocked: [],
      visibleEmployeeIds: [],
      isOrgScope: read.kind === 'org',
      isEmptyTeam: false,
      canCorrect,
    }
  }

  const supabase = createSupabaseAdminClient()
  let punchQuery = supabase
    .from('workforce_time_punches')
    .select(PUNCH_COLUMNS)
    .gte('punch_at', rangeStartIso)
    .lt('punch_at', rangeEndIsoExclusive)
    .order('punch_at', { ascending: true })
  if (ids !== null) punchQuery = punchQuery.in('employee_id', ids)

  const { data, error } = await punchQuery.returns<PunchRow[]>()
  if (error) {
    console.error('[workforce-attendance] getScopedAttendance failed', error)
    throw new Error('We could not load attendance records.')
  }

  return {
    punches: (data ?? []).map(mapPunch),
    // Filled by the caller from the scoped "currently clocked" read below;
    // kept in the same result so the two cannot drift apart.
    currentlyClocked: [],
    visibleEmployeeIds: ids,
    isOrgScope: read.kind === 'org',
    isEmptyTeam: false,
    canCorrect,
  }
}

/**
 * Who is clocked in right now, scoped to the same population.
 *
 * Applied to the SAME id set as the historical punches. A live "who is working
 * now" board is exactly as revealing as the history, so scoping one without
 * the other would leak the current whereabouts of the whole company.
 */
export async function getScopedCurrentlyClocked(
  visibleEmployeeIds: string[] | null,
): Promise<CurrentlyClockedEmployee[]> {
  if (visibleEmployeeIds !== null && visibleEmployeeIds.length === 0) return []

  const { getCurrentlyClockedEmployees } = await import('../../_lib/queries')
  const all = await getCurrentlyClockedEmployees()
  if (visibleEmployeeIds === null) return all
  const allowed = new Set(visibleEmployeeIds)
  return all.filter((e) => allowed.has(e.employeeId))
}
