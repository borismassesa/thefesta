import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import type { WorkspaceEmployee } from '@/lib/workspace/identity'
import { deriveState, type AttendanceState } from './state'
import { sessionMinutes, sumTotals, type WeekTotals } from './hours'

// Attendance reads, all scoped to one employee.
//
// Same rule as the rest of Workspace: every function takes the resolved
// WorkspaceEmployee, never an id, so no route can read another person's
// attendance by changing a payload. Reads use the service-role client (RLS is
// enabled with no policies on these tables), which is exactly why the scoping
// has to be in the signature rather than in a policy.

const DEFAULT_TZ = 'Africa/Dar_es_Salaam'

/** Company default wall-clock window (OF-ENG-RPT-006). Used when a schedule
 *  resolves without a shift template so My Clock never shows "No fixed hours"
 *  on a normal working day. */
export const COMPANY_WORKING_DAY_START = '09:00'
export const COMPANY_WORKING_DAY_END = '17:00'
/** Entitled unpaid break within the 8-hour day. */
export const COMPANY_BREAK_MINUTES = 30

/**
 * Effective punch geolocation given schedule policy + work arrangement.
 * Mirrors attendance_effective_geolocation() in SQL.
 */
export function effectiveGeolocationMode(
  scheduleMode: 'off' | 'optional' | 'required',
  workMode: string | null | undefined,
): 'off' | 'optional' | 'required' {
  const mode = (workMode ?? 'office').trim().toLowerCase()
  if (mode === 'remote') return 'off'
  if (mode === 'hybrid') return scheduleMode === 'off' ? 'off' : 'optional'
  if (mode === 'field') return scheduleMode === 'required' ? 'optional' : scheduleMode
  return scheduleMode
}

export type AttendanceBreak = {
  id: string
  startedAt: string
  endedAt: string | null
  breakType: string
  isPaid: boolean
}

export type AttendanceSession = {
  id: string
  businessDate: string
  state: 'clocked_in' | 'on_break' | 'clocked_out' | 'auto_closed' | 'pending_correction'
  openedAt: string
  closedAt: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  workMode: string
  locationLabel: string | null
  workedMinutes: number
  breakMinutes: number
  payableMinutes: number
  overtimeMinutes: number
  isLate: boolean
  lateMinutes: number
  isEarlyDeparture: boolean
  earlyDepartureMinutes: number
  missingClockOut: boolean
  isWeekend: boolean
  isHoliday: boolean
  correctionPending: boolean
  breaks: AttendanceBreak[]
}

export type AttendancePunch = {
  id: string
  sessionId: string | null
  punchType: 'in' | 'out' | 'break_start' | 'break_end'
  punchedAt: string
  source: string
  locationLabel: string | null
  geofenceOk: boolean | null
  note: string | null
}

export type ScheduledShift = {
  scheduleName: string
  timezone: string
  templateName: string | null
  startTime: string | null
  endTime: string | null
  crossesMidnight: boolean
  workMode: string
  locationLabel: string | null
  isWorkingDay: boolean
  isHoliday: boolean
  holidayName: string | null
  standardDailyMinutes: number
  /** Expected unpaid break within the day (minutes). Punches still decide actuals. */
  unpaidBreakMinutes: number
  geolocationMode: 'off' | 'optional' | 'required'
  geofenceRadiusM: number
  hasGeofenceAnchor: boolean
  requiresTimesheetSubmission: boolean
}

export type AttendanceCorrection = {
  id: string
  businessDate: string
  kind: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  requestReason: string
  requestedAt: string
  decidedAt: string | null
  decisionNote: string | null
}

export type TimesheetSummary = {
  id: string
  periodStart: string
  periodEnd: string
  status: 'open' | 'submitted' | 'approved' | 'rejected' | 'locked'
  totalWorkedMinutes: number
  totalBreakMinutes: number
  totalPayableMinutes: number
  totalOvertimeMinutes: number
  submittedAt: string | null
  decidedAt: string | null
  decisionNote: string | null
}

export type AttendanceOverview = {
  /** Server time when this snapshot was taken. The client counts up from here
   *  rather than from its own clock's idea of when the session opened. */
  serverNow: string
  today: string
  timezone: string
  state: AttendanceState
  openSession: AttendanceSession | null
  /** Live minutes for the open session, computed from serverNow. */
  openSessionMinutes: number
  todaySessions: AttendanceSession[]
  weekSessions: AttendanceSession[]
  weekStart: string
  weekTotals: WeekTotals
  todayTotals: WeekTotals
  shift: ScheduledShift | null
  timesheet: TimesheetSummary | null
  corrections: AttendanceCorrection[]
  /** True when something needs the employee's attention: a missed clock-out. */
  needsCorrection: AttendanceSession[]
}

const SESSION_COLUMNS =
  'id, business_date, state, opened_at, closed_at, scheduled_start, scheduled_end, work_mode, location_label, worked_minutes, break_minutes, payable_minutes, overtime_minutes, is_late, late_minutes, is_early_departure, early_departure_minutes, missing_clock_out, is_weekend, is_holiday, correction_pending'

type SessionRow = {
  id: string
  business_date: string
  state: AttendanceSession['state']
  opened_at: string
  closed_at: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  work_mode: string
  location_label: string | null
  worked_minutes: number
  break_minutes: number
  payable_minutes: number
  overtime_minutes: number
  is_late: boolean
  late_minutes: number
  is_early_departure: boolean
  early_departure_minutes: number
  missing_clock_out: boolean
  is_weekend: boolean
  is_holiday: boolean
  correction_pending: boolean
}

function mapSession(row: SessionRow, breaks: AttendanceBreak[]): AttendanceSession {
  return {
    id: row.id,
    businessDate: row.business_date,
    state: row.state,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    workMode: row.work_mode,
    locationLabel: row.location_label,
    workedMinutes: row.worked_minutes,
    breakMinutes: row.break_minutes,
    payableMinutes: row.payable_minutes,
    overtimeMinutes: row.overtime_minutes,
    isLate: row.is_late,
    lateMinutes: row.late_minutes,
    isEarlyDeparture: row.is_early_departure,
    earlyDepartureMinutes: row.early_departure_minutes,
    missingClockOut: row.missing_clock_out,
    isWeekend: row.is_weekend,
    isHoliday: row.is_holiday,
    correctionPending: row.correction_pending,
    breaks,
  }
}

function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function toTotalsInput(sessions: AttendanceSession[]) {
  return sessions.map((s) => ({
    businessDate: s.businessDate,
    workedMinutes: s.workedMinutes,
    breakMinutes: s.breakMinutes,
    payableMinutes: s.payableMinutes,
    overtimeMinutes: s.overtimeMinutes,
  }))
}

/**
 * Everything the time clock needs, in one pass.
 *
 * `serverNow` is included deliberately. The live counter must tick against the
 * server's clock: a browser running eight minutes fast would otherwise show
 * eight minutes of work that does not exist, and someone would eventually try
 * to reconcile it against payroll.
 */
export async function getAttendanceOverview(
  employee: WorkspaceEmployee,
): Promise<AttendanceOverview> {
  const now = new Date()
  const serverNow = now.toISOString()

  const shift = await getScheduledShift(employee, localDate(now, DEFAULT_TZ))
  const timezone = shift?.timezone ?? DEFAULT_TZ
  const today = localDate(now, timezone)
  const weekStart = addDays(today, -(isoWeekday(today) - 1))
  const weekEnd = addDays(weekStart, 6)

  const empty: AttendanceOverview = {
    serverNow,
    today,
    timezone,
    state: 'off_clock',
    openSession: null,
    openSessionMinutes: 0,
    todaySessions: [],
    weekSessions: [],
    weekStart,
    weekTotals: sumTotals([]),
    todayTotals: sumTotals([]),
    shift,
    timesheet: null,
    corrections: [],
    needsCorrection: [],
  }

  if (!hasSupabaseAdminConfig()) return empty

  try {
    const supabase = createSupabaseAdminClient()

    // The week window covers today, so one query serves both. An overnight
    // session opened on Sunday is still a Sunday session by business_date.
    const { data: sessionRows, error: sessionError } = await supabase
      .from('attendance_sessions')
      .select(SESSION_COLUMNS)
      .eq('employee_id', employee.id)
      .gte('business_date', weekStart)
      .lte('business_date', weekEnd)
      .order('opened_at', { ascending: true })
      .returns<SessionRow[]>()
    if (sessionError) {
      logDbError('attendance.sessions', sessionError, { employeeId: employee.id })
      return empty
    }

    // An open session can predate this week (a night shift started Sunday, or a
    // session nobody closed). Fetch it separately so the clock never shows
    // "off clock" for someone who is actually on it.
    const { data: openRows, error: openError } = await supabase
      .from('attendance_sessions')
      .select(SESSION_COLUMNS)
      .eq('employee_id', employee.id)
      .in('state', ['clocked_in', 'on_break'])
      .limit(1)
      .returns<SessionRow[]>()
    if (openError) {
      logDbError('attendance.open_session', openError, { employeeId: employee.id })
    }

    const allRows = [...(sessionRows ?? [])]
    for (const row of openRows ?? []) {
      if (!allRows.some((r) => r.id === row.id)) allRows.push(row)
    }

    const breaksBySession = await fetchBreaks(allRows.map((r) => r.id))
    const sessions = allRows.map((r) => mapSession(r, breaksBySession.get(r.id) ?? []))

    const openSession = sessions.find((s) => s.state === 'clocked_in' || s.state === 'on_break') ?? null
    const todaySessions = sessions.filter((s) => s.businessDate === today)
    const weekSessions = sessions.filter(
      (s) => s.businessDate >= weekStart && s.businessDate <= weekEnd,
    )

    const latestToday = todaySessions.length > 0 ? todaySessions[todaySessions.length - 1] : null
    const state = deriveState({
      openSession: openSession
        ? { state: openSession.state, closedAt: openSession.closedAt }
        : null,
      latestSessionToday: latestToday
        ? { state: latestToday.state, closedAt: latestToday.closedAt }
        : null,
    })

    const openSessionMinutes = openSession
      ? sessionMinutes({
          openedAt: openSession.openedAt,
          closedAt: null,
          breaks: openSession.breaks,
          now: serverNow,
        }).workedMinutes
      : 0

    const [timesheet, corrections] = await Promise.all([
      getCurrentTimesheet(employee, today),
      getCorrections(employee, 10),
    ])

    return {
      serverNow,
      today,
      timezone,
      state,
      openSession,
      openSessionMinutes,
      todaySessions,
      weekSessions,
      weekStart,
      // Closed sessions only: an open one has no final total, and adding a
      // running counter into a weekly figure makes the number move under the
      // reader for reasons they cannot see.
      weekTotals: sumTotals(toTotalsInput(weekSessions.filter((s) => s.closedAt !== null))),
      todayTotals: sumTotals(toTotalsInput(todaySessions.filter((s) => s.closedAt !== null))),
      shift,
      timesheet,
      corrections,
      needsCorrection: sessions.filter((s) => s.missingClockOut && !s.correctionPending),
    }
  } catch (error) {
    logDbError('attendance.overview', error, { employeeId: employee.id })
    return empty
  }
}

async function fetchBreaks(sessionIds: string[]): Promise<Map<string, AttendanceBreak[]>> {
  const map = new Map<string, AttendanceBreak[]>()
  if (sessionIds.length === 0) return map
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('attendance_breaks')
      .select('id, session_id, started_at, ended_at, break_type, is_paid')
      .in('session_id', sessionIds)
      .order('started_at', { ascending: true })
      .returns<
        {
          id: string
          session_id: string
          started_at: string
          ended_at: string | null
          break_type: string
          is_paid: boolean
        }[]
      >()
    if (error) {
      logDbError('attendance.breaks', error)
      return map
    }
    for (const row of data ?? []) {
      const list = map.get(row.session_id) ?? []
      list.push({
        id: row.id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        breakType: row.break_type,
        isPaid: row.is_paid,
      })
      map.set(row.session_id, list)
    }
    return map
  } catch (error) {
    logDbError('attendance.breaks', error)
    return map
  }
}

/**
 * The shift the employee is scheduled to work on a date, resolved through the
 * same precedence the database uses (weekday assignment, then schedule-level,
 * then the default schedule).
 */
export async function getScheduledShift(
  employee: WorkspaceEmployee,
  date: string,
): Promise<ScheduledShift | null> {
  if (!hasSupabaseAdminConfig()) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data: resolved, error: resolveError } = await supabase.rpc(
      'attendance_resolve_schedule',
      { p_employee_id: employee.id, p_date: date },
    )
    if (resolveError) {
      logDbError('attendance.resolve_schedule', resolveError, { employeeId: employee.id })
      return null
    }
    // SETOF return: supabase-js types it as unknown, so the shape is asserted
    // here at the boundary and never assumed further in.
    type ResolvedRow = { schedule_id: string; shift_template_id: string | null; work_mode: string }
    const row = (Array.isArray(resolved) ? (resolved as ResolvedRow[]) : [])[0]
    if (!row) return null

    const [scheduleResult, templateResult, holidayResult] = await Promise.all([
      supabase
        .from('work_schedules')
        .select(
          'name, timezone, working_weekdays, standard_daily_minutes, geolocation_mode, geofence_radius_m, requires_timesheet_submission',
        )
        .eq('id', row.schedule_id)
        .maybeSingle<{
          name: string
          timezone: string
          working_weekdays: number[]
          standard_daily_minutes: number
          geolocation_mode: 'off' | 'optional' | 'required'
          geofence_radius_m: number
          requires_timesheet_submission: boolean
        }>(),
      row.shift_template_id
        ? supabase
            .from('shift_templates')
            .select(
              'name, start_time, end_time, crosses_midnight, work_mode, location_label, unpaid_break_minutes, latitude, longitude, geofence_radius_m',
            )
            .eq('id', row.shift_template_id)
            .maybeSingle<{
              name: string
              start_time: string
              end_time: string
              crosses_midnight: boolean
              work_mode: string
              location_label: string | null
              unpaid_break_minutes: number
              latitude: number | null
              longitude: number | null
              geofence_radius_m: number | null
            }>()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('holiday_calendars')
        .select('name, schedule_id')
        .eq('holiday_date', date)
        .or(`schedule_id.is.null,schedule_id.eq.${row.schedule_id}`)
        .limit(1)
        .returns<{ name: string; schedule_id: string | null }[]>(),
    ])

    const schedule = scheduleResult.data
    if (!schedule) return null
    const template = templateResult.data
    const holiday = (holidayResult.data ?? [])[0] ?? null
    const isWorkingDay = (schedule.working_weekdays ?? []).includes(isoWeekday(date))
    const isHoliday = Boolean(holiday)

    // Working days without an assigned template still have a company day:
    // 09:00–17:00. Rest days and holidays stay without fixed punch windows.
    const useCompanyHours = isWorkingDay && !isHoliday && !template?.start_time

    return {
      scheduleName: schedule.name,
      timezone: schedule.timezone,
      templateName: template?.name ?? (useCompanyHours ? 'Standard day' : null),
      startTime: template?.start_time ?? (useCompanyHours ? COMPANY_WORKING_DAY_START : null),
      endTime: template?.end_time ?? (useCompanyHours ? COMPANY_WORKING_DAY_END : null),
      crossesMidnight: Boolean(template?.crosses_midnight),
      workMode: row.work_mode,
      locationLabel: template?.location_label ?? null,
      isWorkingDay,
      isHoliday,
      holidayName: holiday?.name ?? null,
      standardDailyMinutes: schedule.standard_daily_minutes,
      unpaidBreakMinutes:
        template?.unpaid_break_minutes ?? (useCompanyHours ? COMPANY_BREAK_MINUTES : 0),
      geolocationMode: effectiveGeolocationMode(schedule.geolocation_mode, row.work_mode),
      geofenceRadiusM: template?.geofence_radius_m ?? schedule.geofence_radius_m,
      hasGeofenceAnchor: template?.latitude != null && template?.longitude != null,
      requiresTimesheetSubmission: schedule.requires_timesheet_submission,
    }
  } catch (error) {
    logDbError('attendance.shift', error, { employeeId: employee.id })
    return null
  }
}

/** Raw punch history. The evidence, shown to the employee unedited. */
export async function getPunchHistory(
  employee: WorkspaceEmployee,
  limit = 50,
): Promise<AttendancePunch[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('attendance_punches')
      .select('id, session_id, punch_type, punched_at, source, location_label, geofence_ok, note')
      .eq('employee_id', employee.id)
      .order('punched_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200))
      .returns<
        {
          id: string
          session_id: string | null
          punch_type: AttendancePunch['punchType']
          punched_at: string
          source: string
          location_label: string | null
          geofence_ok: boolean | null
          note: string | null
        }[]
      >()
    if (error) {
      logDbError('attendance.punches', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      punchType: row.punch_type,
      punchedAt: row.punched_at,
      source: row.source,
      locationLabel: row.location_label,
      geofenceOk: row.geofence_ok,
      note: row.note,
    }))
  } catch (error) {
    logDbError('attendance.punches', error, { employeeId: employee.id })
    return []
  }
}

export async function getCurrentTimesheet(
  employee: WorkspaceEmployee,
  date: string,
): Promise<TimesheetSummary | null> {
  if (!hasSupabaseAdminConfig()) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('timesheets')
      .select(
        'id, period_start, period_end, status, total_worked_minutes, total_break_minutes, total_payable_minutes, total_overtime_minutes, submitted_at, decided_at, decision_note',
      )
      .eq('employee_id', employee.id)
      .lte('period_start', date)
      .gte('period_end', date)
      .maybeSingle<{
        id: string
        period_start: string
        period_end: string
        status: TimesheetSummary['status']
        total_worked_minutes: number
        total_break_minutes: number
        total_payable_minutes: number
        total_overtime_minutes: number
        submitted_at: string | null
        decided_at: string | null
        decision_note: string | null
      }>()
    if (error) {
      logDbError('attendance.timesheet', error, { employeeId: employee.id })
      return null
    }
    if (!data) return null
    return {
      id: data.id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      status: data.status,
      totalWorkedMinutes: data.total_worked_minutes,
      totalBreakMinutes: data.total_break_minutes,
      totalPayableMinutes: data.total_payable_minutes,
      totalOvertimeMinutes: data.total_overtime_minutes,
      submittedAt: data.submitted_at,
      decidedAt: data.decided_at,
      decisionNote: data.decision_note,
    }
  } catch (error) {
    logDbError('attendance.timesheet', error, { employeeId: employee.id })
    return null
  }
}

export async function getCorrections(
  employee: WorkspaceEmployee,
  limit = 10,
): Promise<AttendanceCorrection[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('attendance_corrections')
      .select('id, business_date, kind, status, request_reason, requested_at, decided_at, decision_note')
      .eq('employee_id', employee.id)
      .order('requested_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50))
      .returns<
        {
          id: string
          business_date: string
          kind: string
          status: AttendanceCorrection['status']
          request_reason: string
          requested_at: string
          decided_at: string | null
          decision_note: string | null
        }[]
      >()
    if (error) {
      logDbError('attendance.corrections', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      businessDate: row.business_date,
      kind: row.kind,
      status: row.status,
      requestReason: row.request_reason,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      decisionNote: row.decision_note,
    }))
  } catch (error) {
    logDbError('attendance.corrections', error, { employeeId: employee.id })
    return []
  }
}
