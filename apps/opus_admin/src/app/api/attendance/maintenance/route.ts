import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { emitWorkflowEvent } from '@/lib/notifications/emit'

// Nightly attendance maintenance. Two jobs, one endpoint.
//
//   1. AUTO-CLOSE. Sessions left open past their schedule's cutoff are closed at
//      their scheduled end and flagged missing_clock_out. Left alone, a session
//      nobody closed accrues forever: someone who forgot to clock out on Friday
//      would show 60 hours by Monday, and the first anyone would know is
//      payroll. Closing at the SCHEDULED end rather than now() is the neutral
//      choice; the employee can correct it either way.
//
//   2. MISSING PUNCHES. Scheduled working days with no session at all, and
//      sessions the auto-close had to finish. Reported, never invented: the
//      system does not know whether someone worked, and fabricating attendance
//      is worse than flagging a gap.
//
// Both jobs are idempotent, so an overlapping or repeated run is harmless. The
// auto-close claims rows with FOR UPDATE SKIP LOCKED.
//
// Triggered by pg_cron via pg_net (see the accompanying migration) and protected
// by a shared secret, exactly like /api/notifications/retry: knowing the URL is
// not enough to drive it.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MissingRow = {
  employee_id: string
  business_date: string
  reason: string
}

export async function POST(request: NextRequest) {
  const secret = process.env.ATTENDANCE_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'Supabase admin env missing' }, { status: 503 })
  }

  const supabase = createSupabaseAdminClient()

  // ---- 1. Auto-close ----
  let autoClosed = 0
  const { data: closedCount, error: closeError } = await supabase.rpc(
    'attendance_auto_close_stale_sessions',
  )
  if (closeError) {
    logDbError('attendance.auto_close', closeError)
  } else {
    autoClosed = typeof closedCount === 'number' ? closedCount : 0
  }

  // ---- 2. Missing punches ----
  const { data: missing, error: missingError } = await supabase.rpc(
    'attendance_detect_missing_punches',
    { p_business_date: null },
  )
  if (missingError) {
    logDbError('attendance.detect_missing', missingError)
    return NextResponse.json({ ok: true, autoClosed, missing: 0, notified: 0 })
  }

  // The RPC returns SETOF; supabase-js types it as unknown, so the shape is
  // asserted here against the declared row type rather than trusted anywhere
  // downstream.
  const rows: MissingRow[] = Array.isArray(missing) ? (missing as MissingRow[]) : []

  // ---- 3. Tell the people affected ----
  // A detection nobody sees is not a detection. Each affected employee gets one
  // notification per gap, deep-linked to the clock where they can raise a
  // correction. Failures here do not fail the job: the gap is still recorded on
  // the session and still visible on the page.
  let notified = 0
  const directory = await loadRecipients(supabase, rows.map((r) => r.employee_id))

  for (const row of rows) {
    const person = directory.get(row.employee_id)
    if (!person) continue
    try {
      const isMissingIn = row.reason === 'missing_clock_in'
      // No emailPayload: this lands in the bell only. An automated nightly
      // sweep does not need to put a message in everyone's inbox, and the
      // employee sees it the moment they open Workspace.
      await emitWorkflowEvent({
        entityType: 'attendance_session',
        entityId: row.employee_id,
        eventType: 'attendance.gap_detected',
        actor: { employeeId: null, name: 'Time clock' },
        recipients: [
          { employeeId: row.employee_id, name: person.full_name, email: person.email },
        ],
        title: isMissingIn
          ? `No attendance recorded for ${row.business_date}`
          : `You did not clock out on ${row.business_date}`,
        body: isMissingIn
          ? 'You were scheduled to work but nothing was recorded. Raise a correction if you worked that day.'
          : 'The session was closed automatically at its scheduled end. Raise a correction if the hours are wrong.',
        href: '/workspace/timeclock',
        metadata: { reason: row.reason, businessDate: row.business_date },
      })
      notified += 1
    } catch (error) {
      logDbError('attendance.notify_gap', error, { employeeId: row.employee_id })
    }
  }

  return NextResponse.json({
    ok: true,
    autoClosed,
    missing: rows.length,
    notified,
  })
}

/** Names and addresses for the affected employees, in one round-trip. */
async function loadRecipients(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  employeeIds: string[],
): Promise<Map<string, { full_name: string; email: string }>> {
  const map = new Map<string, { full_name: string; email: string }>()
  const unique = [...new Set(employeeIds)]
  if (unique.length === 0) return map
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id, full_name, email')
    .in('id', unique)
    .returns<{ id: string; full_name: string; email: string }[]>()
  if (error) {
    logDbError('attendance.recipients', error)
    return map
  }
  for (const row of data ?? []) {
    map.set(row.id, { full_name: row.full_name, email: row.email })
  }
  return map
}
