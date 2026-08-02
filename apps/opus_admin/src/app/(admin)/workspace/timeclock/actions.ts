'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { recordSensitiveWorkspaceAction } from '@/lib/workspace/activity'
import { toSafeMessage } from '@/lib/workspace/errors'
import { attendanceErrorToken, attendanceMessage } from '@/lib/attendance/errors'
import type { AttendanceAction } from '@/lib/attendance/state'

// Time clock server actions.
//
// THE TIMESTAMP RULE. None of these takes a time. Every stored punch time is
// now(), evaluated inside the database function that performs the transition,
// so a wrong browser clock, a replayed request and a hand-crafted payload all
// produce the correct time. The browser's clock is used in exactly one place:
// counting up from a server-supplied opened_at for display.
//
// THE IDENTITY RULE. None of these takes an employee id either. It comes from
// requireWorkspaceCapability, which resolves the Clerk session and enforces the
// employee's access state. 'tools.use' is granted only by full access, so a
// resigned, suspended or terminated employee cannot punch.
//
// THE ERROR RULE. The RPCs raise stable dotted tokens; attendanceMessage maps a
// whitelisted token to text we wrote and collapses everything else. No database
// string reaches the browser.

export type ClockResult =
  | { ok: true }
  | { ok: false; error: string; refusal: boolean }

/** Position claimed by the browser. Only ever used for the geofence check and
 *  the audit trail; it can never influence the recorded TIME. */
export type ClockPosition = {
  latitude: number
  longitude: number
  accuracyM?: number
}

function isFinitePosition(position: ClockPosition | undefined): position is ClockPosition {
  return (
    !!position &&
    Number.isFinite(position.latitude) &&
    Number.isFinite(position.longitude) &&
    Math.abs(position.latitude) <= 90 &&
    Math.abs(position.longitude) <= 180
  )
}

async function requestMetadata() {
  const h = await headers()
  const xff = h.get('x-forwarded-for')
  return {
    ip: xff?.split(',')[0]?.trim() || h.get('x-real-ip') || null,
    userAgent: h.get('user-agent')?.slice(0, 500) ?? null,
  }
}

function revalidateClock() {
  revalidatePath('/workspace')
  revalidatePath('/workspace/timeclock')
  revalidatePath('/workforce/timesheets')
}

const ACTION_SUMMARY: Record<AttendanceAction, string> = {
  clock_in: 'Clocked in',
  start_break: 'Started a break',
  end_break: 'Ended a break',
  clock_out: 'Clocked out',
}

/**
 * One body for all four transitions: resolve the caller, call the RPC, translate
 * the outcome, record it. Keeping them in one place is what stops one of the
 * four quietly losing its audit line or its error translation.
 */
async function runTransition(
  action: AttendanceAction,
  rpc: string,
  params: Record<string, unknown>,
  position?: ClockPosition,
): Promise<ClockResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: `timeclock.${action}` }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error), refusal: false }
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc(rpc, {
    p_employee_id: employee.id,
    p_actor_clerk_id: employee.clerkUserId,
    ...params,
  })

  if (error) {
    const token = attendanceErrorToken(error)
    if (!token) {
      // Not one of ours: log the SQLSTATE, say nothing about it.
      logDbError(`attendance.${action}`, error, { employeeId: employee.id })
    }
    return {
      ok: false,
      error: attendanceMessage(error),
      // A refusal means the state moved under us (another tab, a double tap).
      // The page reloads and shows the truth rather than reporting a fault.
      refusal: token !== null,
    }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: `workspace.attendance.${action}`,
    summary: ACTION_SUMMARY[action],
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    metadata: {
      action,
      // Whether a position was supplied, never the coordinates. An activity
      // feed is not a location history.
      positionProvided: isFinitePosition(position),
    },
  })

  revalidateClock()
  return { ok: true }
}

export async function clockIn(position?: ClockPosition): Promise<ClockResult> {
  const { ip, userAgent } = await requestMetadata()
  const pos = isFinitePosition(position) ? position : null
  return runTransition(
    'clock_in',
    'attendance_clock_in',
    {
      p_source: 'web',
      p_ip: ip,
      p_user_agent: userAgent,
      p_latitude: pos?.latitude ?? null,
      p_longitude: pos?.longitude ?? null,
      p_accuracy_m: pos?.accuracyM ?? null,
    },
    position,
  )
}

export async function clockOut(position?: ClockPosition): Promise<ClockResult> {
  const { ip, userAgent } = await requestMetadata()
  const pos = isFinitePosition(position) ? position : null
  return runTransition(
    'clock_out',
    'attendance_clock_out',
    {
      p_source: 'web',
      p_ip: ip,
      p_user_agent: userAgent,
      p_latitude: pos?.latitude ?? null,
      p_longitude: pos?.longitude ?? null,
      p_accuracy_m: pos?.accuracyM ?? null,
    },
    position,
  )
}

export async function startBreak(breakType: string = 'rest'): Promise<ClockResult> {
  const allowed = ['rest', 'meal', 'personal', 'other']
  return runTransition('start_break', 'attendance_start_break', {
    p_break_type: allowed.includes(breakType) ? breakType : 'rest',
    p_source: 'web',
  })
}

export async function endBreak(): Promise<ClockResult> {
  return runTransition('end_break', 'attendance_end_break', { p_source: 'web' })
}

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

export type CorrectionInput = {
  businessDate: string
  sessionId?: string | null
  kind:
    | 'missing_clock_in'
    | 'missing_clock_out'
    | 'wrong_clock_in'
    | 'wrong_clock_out'
    | 'missing_break'
    | 'wrong_break'
    | 'whole_day'
    | 'other'
  reason: string
  /** Local datetime strings from the form. CLAIMS, not evidence: they are stored
   *  as a request and only become punches if somebody approves them. */
  clockInAt?: string | null
  clockOutAt?: string | null
}

export type CorrectionResult = { ok: true } | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const KINDS = new Set([
  'missing_clock_in', 'missing_clock_out', 'wrong_clock_in', 'wrong_clock_out',
  'missing_break', 'wrong_break', 'whole_day', 'other',
])

/**
 * Raise a correction request.
 *
 * This is the ONLY way an employee can change what their attendance says, and
 * it does not change it: it records a claim for someone else to decide. The
 * original punches are untouched either way, which is what keeps the record
 * worth having.
 */
export async function requestCorrection(input: CorrectionInput): Promise<CorrectionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', {
      action: 'timeclock.request_correction',
    }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (!DATE_RE.test(input.businessDate)) {
    return { ok: false, error: 'Pick a valid date.' }
  }
  if (!KINDS.has(input.kind)) {
    return { ok: false, error: 'Pick what needs correcting.' }
  }
  const reason = input.reason.trim()
  if (reason.length < 10) {
    return { ok: false, error: 'Explain what happened in a sentence or two.' }
  }
  if (reason.length > 2000) {
    return { ok: false, error: 'Keep the explanation under 2000 characters.' }
  }

  const changes: Record<string, string> = {}
  for (const [key, value] of [
    ['clock_in_at', input.clockInAt],
    ['clock_out_at', input.clockOutAt],
  ] as const) {
    if (!value) continue
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: 'One of the times you entered is not a valid time.' }
    }
    // A claim about the future is not a correction.
    if (parsed.getTime() > Date.now() + 60_000) {
      return { ok: false, error: 'You cannot request a correction for a time in the future.' }
    }
    changes[key] = parsed.toISOString()
  }
  if (changes.clock_in_at && changes.clock_out_at && changes.clock_out_at <= changes.clock_in_at) {
    return { ok: false, error: 'The end time has to be after the start time.' }
  }

  const supabase = createSupabaseAdminClient()

  // Session ownership. A correction may only be raised against the requester's
  // own session, checked here rather than trusted from the form.
  let sessionId: string | null = null
  if (input.sessionId) {
    const { data: session, error: sessionError } = await supabase
      .from('attendance_sessions')
      .select('id')
      .eq('id', input.sessionId)
      .eq('employee_id', employee.id)
      .maybeSingle<{ id: string }>()
    if (sessionError) {
      logDbError('attendance.correction.session_lookup', sessionError, { employeeId: employee.id })
      return { ok: false, error: attendanceMessage(sessionError) }
    }
    if (!session) {
      return { ok: false, error: 'That session is not on your record.' }
    }
    sessionId = session.id
  }

  const { data: created, error } = await supabase
    .from('attendance_corrections')
    .insert({
      employee_id: employee.id,
      session_id: sessionId,
      business_date: input.businessDate,
      kind: input.kind,
      requested_by_employee_id: employee.id,
      request_reason: reason,
      requested_changes: changes,
    })
    .select('id')
    .single<{ id: string }>()

  if (error) {
    // The partial unique index stops a second open request for the same day.
    if ((error as { code?: string }).code === '23505') {
      return {
        ok: false,
        error: 'You already have a correction waiting for a decision on that day.',
      }
    }
    logDbError('attendance.correction.insert', error, { employeeId: employee.id })
    return { ok: false, error: attendanceMessage(error) }
  }

  if (sessionId) {
    const { error: flagError } = await supabase
      .from('attendance_sessions')
      .update({ correction_pending: true })
      .eq('id', sessionId)
      .eq('employee_id', employee.id)
    if (flagError) {
      logDbError('attendance.correction.flag', flagError, { employeeId: employee.id })
    }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.attendance.correction_requested',
    summary: `Requested an attendance correction for ${input.businessDate}`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `attendance_corrections:${created.id}`,
    metadata: { kind: input.kind, businessDate: input.businessDate, sessionId },
    severity: 'warn',
    auditMessage: `Attendance correction requested by ${employee.employeeCode}`,
  })

  revalidateClock()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

export type SubmitTimesheetResult = { ok: true } | { ok: false; error: string }

/**
 * Submit the timesheet covering a date for approval.
 *
 * Refuses while the period still has an open session or an undecided
 * correction: submitting a period whose numbers are still moving means the
 * approver signs off on something that will change after they do.
 */
export async function submitTimesheet(periodStart: string): Promise<SubmitTimesheetResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', {
      action: 'timeclock.submit_timesheet',
    }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (!DATE_RE.test(periodStart)) return { ok: false, error: 'Pick a valid period.' }

  const supabase = createSupabaseAdminClient()
  const { data: timesheet, error: loadError } = await supabase
    .from('timesheets')
    .select('id, status, period_start, period_end')
    .eq('employee_id', employee.id)
    .eq('period_start', periodStart)
    .maybeSingle<{ id: string; status: string; period_start: string; period_end: string }>()

  if (loadError) {
    logDbError('attendance.timesheet.load', loadError, { employeeId: employee.id })
    return { ok: false, error: attendanceMessage(loadError) }
  }
  if (!timesheet) return { ok: false, error: 'There is no timesheet for that period yet.' }
  if (timesheet.status === 'approved' || timesheet.status === 'locked') {
    return { ok: false, error: 'That timesheet has already been approved.' }
  }
  if (timesheet.status === 'submitted') {
    return { ok: false, error: 'That timesheet is already waiting for approval.' }
  }

  const { count: openCount, error: openError } = await supabase
    .from('attendance_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employee.id)
    .gte('business_date', timesheet.period_start)
    .lte('business_date', timesheet.period_end)
    .or('state.eq.clocked_in,state.eq.on_break,correction_pending.eq.true')
  if (openError) {
    logDbError('attendance.timesheet.open_check', openError, { employeeId: employee.id })
    return { ok: false, error: attendanceMessage(openError) }
  }
  if ((openCount ?? 0) > 0) {
    return {
      ok: false,
      error:
        'This period still has an open session or a correction waiting for a decision. Resolve those first.',
    }
  }

  const { error } = await supabase
    .from('timesheets')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', timesheet.id)
    .eq('employee_id', employee.id)
    // Concurrency guard: only an 'open' or 'rejected' sheet may be submitted, so
    // two submits cannot both move it.
    .in('status', ['open', 'rejected'])
  if (error) {
    logDbError('attendance.timesheet.submit', error, { employeeId: employee.id })
    return { ok: false, error: attendanceMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.attendance.timesheet_submitted',
    summary: `Submitted the timesheet for ${timesheet.period_start} to ${timesheet.period_end}`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `timesheets:${timesheet.id}`,
    metadata: { periodStart: timesheet.period_start, periodEnd: timesheet.period_end },
  })

  revalidateClock()
  return { ok: true }
}
