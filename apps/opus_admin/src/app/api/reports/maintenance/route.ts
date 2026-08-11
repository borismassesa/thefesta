import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { emitWorkflowEvent } from '@/lib/notifications/emit'
import { isCronAuthorized } from '@/lib/cron-auth'

// Report maintenance. Four jobs, one endpoint, all idempotent.
//
//   1. GENERATE obligations for closed periods. This is what "report
//      requirements are generated automatically" means: nobody types a due
//      date, and a template switched on today starts producing work items on
//      its own.
//   2. MARK OVERDUE past the due date plus grace.
//   3. LOCK accepted reports once the template's window has elapsed.
//   4. REMIND the people who owe something.
//
// Reminders are the only part that can annoy someone, so they are rate-limited
// per obligation rather than per run: an hourly job must not mean an hourly
// notification.
//
// Protected by a shared secret, same as the other cron endpoints.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Minimum gap between reminders for the same obligation. */
const REMINDER_INTERVAL_HOURS = 24
/** Stop nagging after this many reminders; at that point it is a conversation,
 *  not a notification. */
const MAX_REMINDERS = 4

type DueRow = {
  id: string
  employee_id: string
  period_label: string
  due_date: string
  state: string
  reminder_count: number
  last_reminder_at: string | null
  report_templates: { name: string } | null
}

export async function POST(request: NextRequest) {
  const secret = process.env.REPORTS_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!isCronAuthorized(auth, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'Supabase admin env missing' }, { status: 503 })
  }

  const supabase = createSupabaseAdminClient()
  const failedJobs: string[] = []

  const { data: generated, error: generateError } = await supabase.rpc(
    'report_generate_obligations',
    { p_today: null },
  )
  if (generateError) {
    logDbError('reports.generate', generateError)
    failedJobs.push('generate_obligations')
  }

  const { data: overdue, error: overdueError } = await supabase.rpc('report_mark_overdue', {
    p_today: null,
  })
  if (overdueError) {
    logDbError('reports.overdue', overdueError)
    failedJobs.push('mark_overdue')
  }

  const { data: locked, error: lockError } = await supabase.rpc('report_lock_accepted', {
    p_today: null,
  })
  if (lockError) {
    logDbError('reports.lock', lockError)
    failedJobs.push('lock_accepted')
  }

  const reminded = await sendReminders(supabase)

  return NextResponse.json(
    {
      ok: failedJobs.length === 0,
      generated: typeof generated === 'number' ? generated : 0,
      markedOverdue: typeof overdue === 'number' ? overdue : 0,
      locked: typeof locked === 'number' ? locked : 0,
      reminded,
      failedJobs,
    },
    { status: failedJobs.length === 0 ? 200 : 500 },
  )
}

async function sendReminders(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<number> {
  const cutoff = new Date(Date.now() - REMINDER_INTERVAL_HOURS * 3_600_000).toISOString()

  const { data, error } = await supabase
    .from('report_obligations')
    .select(
      'id, employee_id, period_label, due_date, state, reminder_count, last_reminder_at, report_templates(name)',
    )
    .in('state', ['open', 'overdue'])
    .lte('due_date', new Date().toISOString().slice(0, 10))
    .lt('reminder_count', MAX_REMINDERS)
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${cutoff}`)
    .limit(200)
    .returns<DueRow[]>()

  if (error) {
    logDbError('reports.reminders.select', error)
    return 0
  }

  const rows = data ?? []
  if (rows.length === 0) return 0

  const { data: people } = await supabase
    .from('workforce_employees')
    .select('id, full_name, email')
    .in('id', [...new Set(rows.map((r) => r.employee_id))])
    .returns<{ id: string; full_name: string; email: string }[]>()
  const directory = new Map((people ?? []).map((p) => [p.id, p]))

  let sent = 0
  for (const row of rows) {
    const person = directory.get(row.employee_id)
    if (!person) continue
    try {
      // Bell only: an automated nudge does not need to be an email, and the
      // employee sees it the moment they open Workspace.
      await emitWorkflowEvent({
        entityType: 'report_obligation',
        entityId: row.id,
        eventType: 'report.due',
        actor: { employeeId: null, name: 'Reports' },
        recipients: [{ employeeId: row.employee_id, name: person.full_name, email: person.email }],
        title:
          row.state === 'overdue'
            ? `${row.report_templates?.name ?? 'A report'} is overdue`
            : `${row.report_templates?.name ?? 'A report'} is due`,
        body: `${row.period_label}, due ${row.due_date}.`,
        href: '/workspace/reports',
        metadata: { obligationId: row.id, state: row.state, reminderCount: row.reminder_count + 1 },
      })

      await supabase
        .from('report_obligations')
        .update({
          reminder_count: row.reminder_count + 1,
          last_reminder_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        // Only bump a counter that has not moved since we read it, so two
        // overlapping runs cannot double-count a reminder.
        .eq('reminder_count', row.reminder_count)

      sent += 1
    } catch (error) {
      logDbError('reports.reminders.emit', error, { obligationId: row.id })
    }
  }

  return sent
}
