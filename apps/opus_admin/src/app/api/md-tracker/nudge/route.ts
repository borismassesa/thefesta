import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { addDays } from '@/app/(admin)/workspace/tracker/_lib/week'

// Proactive nudge for the MD Daily Tracker: for each engine, if yesterday's
// entry is missing (or fully empty), email the assigned MD(s) — the tool's
// whole premise is daily discipline, and previously the "missed" flag only
// showed up if someone happened to open the dashboard.
//
// Triggered by pg_cron (see migration 20260701000009) once a day, shortly
// after end of day in Africa/Dar_es_Salaam. Protected by a shared secret so
// it can't be hit by anyone who finds the URL.

const TZ = 'Africa/Dar_es_Salaam'

function todayInTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

type EngineRow = {
  id: string
  name: string
  md_employee_ids: string[] | null
  acting_md_employee_id: string | null
  works_saturday: boolean
}

type EntryRow = {
  engine_id: string
  top_priority: string
  other_tasks: string
  status: string | null
  blockers: string
  end_of_day_note: string
}

function isFilled(row: EntryRow | undefined): boolean {
  if (!row) return false
  return Boolean(
    row.top_priority.trim() || row.other_tasks.trim() || row.status || row.blockers.trim() || row.end_of_day_note.trim(),
  )
}

export async function POST(request: NextRequest) {
  const secret = process.env.MD_TRACKER_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const yesterday = addDays(todayInTz(), -1)
  const weekday = new Date(`${yesterday}T00:00:00Z`).getUTCDay() // 0=Sun..6=Sat
  if (weekday === 0) {
    return NextResponse.json({ skipped: 'Sunday — not a tracked day' })
  }

  const supabase = createSupabaseAdminClient()
  const { data: engineRows } = await supabase
    .from('md_tracker_engines')
    .select('id, name, md_employee_ids, acting_md_employee_id, works_saturday')
    .returns<EngineRow[]>()

  const dueEngines = (engineRows ?? []).filter((e) => weekday !== 6 || e.works_saturday)
  if (dueEngines.length === 0) return NextResponse.json({ nudged: [] })

  const { data: entryRows } = await supabase
    .from('md_tracker_entries')
    .select('engine_id, top_priority, other_tasks, status, blockers, end_of_day_note')
    .eq('entry_date', yesterday)
    .in('engine_id', dueEngines.map((e) => e.id))
    .returns<EntryRow[]>()
  const entryByEngine = new Map((entryRows ?? []).map((r) => [r.engine_id, r]))

  const missing = dueEngines.filter((e) => !isFilled(entryByEngine.get(e.id)))
  if (missing.length === 0) return NextResponse.json({ nudged: [] })

  const mdIds = Array.from(
    new Set(missing.flatMap((e) => [...(e.md_employee_ids ?? []), e.acting_md_employee_id]).filter((id): id is string => Boolean(id))),
  )
  const { data: mdRows } = mdIds.length
    ? await supabase
        .from('workforce_employees')
        .select('id, full_name, email')
        .in('id', mdIds)
        .returns<{ id: string; full_name: string; email: string }[]>()
    : { data: [] }
  const mdById = new Map((mdRows ?? []).map((m) => [m.id, m]))

  const nudged: string[] = []
  for (const engine of missing) {
    const recipientIds = [...(engine.md_employee_ids ?? []), engine.acting_md_employee_id].filter(
      (id): id is string => Boolean(id),
    )
    const recipients = recipientIds.map((id) => mdById.get(id)).filter((m): m is { id: string; full_name: string; email: string } => Boolean(m))
    if (recipients.length === 0) continue

    await sendEmail({
      to: recipients.map((m) => m.email),
      subject: `Reminder: ${engine.name}'s Daily Tracker entry for ${yesterday} is missing`,
      html: `
        <p>Hi ${recipients.map((m) => m.full_name.split(' ')[0]).join(' / ')},</p>
        <p><strong>${engine.name}</strong> has no MD Daily Tracker entry logged for <strong>${yesterday}</strong>.</p>
        <p>Please log yesterday's top priority and status when you get a chance — the CEO reviews these at the end of each week.</p>
      `,
    })
    nudged.push(engine.name)
  }

  return NextResponse.json({ nudged })
}
