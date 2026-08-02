import { NextResponse, type NextRequest } from 'next/server'
import { hasAnyPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { renderTrackerPdfBuffer, type TrackerPdfEngine, type TrackerPdfEntry } from '@/lib/tracker-pdf'
import { TRACKER_DAY_LABELS, formatDayDate, formatWeekLabel, getWeekDates } from '@/app/(admin)/workspace/tracker/_lib/week'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type EngineRow = {
  id: string
  slug: string
  name: string
  sort_order: number
  md_employee_ids: string[] | null
}

type EntryRow = {
  engine_id: string
  entry_date: string
  top_priority: string
  other_tasks: string
  status: string | null
  blockers: string
  end_of_day_note: string
}

type ReviewRow = {
  engine_id: string
  wins: string
  carried_to_next_week: string
  ceo_comment: string
}

// Downloads a branded PDF of one week of the MD Daily Tracker, for handing
// the CEO's weekly review to someone outside the dashboard. Same
// view-permission bar as the page itself.
export async function GET(request: NextRequest) {
  const weekStart = request.nextUrl.searchParams.get('week') ?? ''
  if (!DATE_RE.test(weekStart)) {
    return NextResponse.json({ error: 'Invalid week.' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { data: engineRows } = await supabase
    .from('md_tracker_engines')
    .select('id, slug, name, sort_order, md_employee_ids')
    .order('sort_order', { ascending: true })
    .returns<EngineRow[]>()
  const engineWriteKeys = (engineRows ?? []).map((e) => `md_tracker.${e.slug}.write`)

  const canView = await hasAnyPermission(['workforce.read', 'md_tracker.review', ...engineWriteKeys])
  if (!canView) {
    return NextResponse.json({ error: "You don't have permission to view this." }, { status: 403 })
  }

  const { data: week } = await supabase
    .from('md_tracker_weeks')
    .select('id')
    .eq('week_start', weekStart)
    .maybeSingle<{ id: string }>()
  if (!week) {
    return NextResponse.json({ error: 'No data for that week yet.' }, { status: 404 })
  }

  const [{ data: entryRows }, { data: reviewRows }] = await Promise.all([
    supabase
      .from('md_tracker_entries')
      .select('engine_id, entry_date, top_priority, other_tasks, status, blockers, end_of_day_note')
      .eq('week_id', week.id)
      .returns<EntryRow[]>(),
    supabase
      .from('md_tracker_week_reviews')
      .select('engine_id, wins, carried_to_next_week, ceo_comment')
      .eq('week_id', week.id)
      .returns<ReviewRow[]>(),
  ])

  const employeeIds = Array.from(
    new Set((engineRows ?? []).flatMap((e) => e.md_employee_ids ?? [])),
  )
  const employeeNames = new Map<string, string>()
  if (employeeIds.length > 0) {
    const { data: employees } = await supabase
      .from('workforce_employees')
      .select('id, full_name')
      .in('id', employeeIds)
      .returns<{ id: string; full_name: string }[]>()
    for (const e of employees ?? []) employeeNames.set(e.id, e.full_name)
  }

  const dates = getWeekDates(weekStart)
  const engines: TrackerPdfEngine[] = (engineRows ?? []).map((engine) => {
    const days = dates.map((date, i) => {
      const row = (entryRows ?? []).find((r) => r.engine_id === engine.id && r.entry_date === date)
      const entry: TrackerPdfEntry | null = row
        ? {
            topPriority: row.top_priority,
            otherTasks: row.other_tasks,
            status: row.status,
            blockers: row.blockers,
            endOfDayNote: row.end_of_day_note,
          }
        : null
      return { label: TRACKER_DAY_LABELS[i], date: formatDayDate(date), entry }
    })
    const reviewRow = (reviewRows ?? []).find((r) => r.engine_id === engine.id)
    return {
      name: engine.name,
      mdNames: (engine.md_employee_ids ?? []).map((id) => employeeNames.get(id)).filter((n): n is string => Boolean(n)),
      days,
      review: reviewRow
        ? { wins: reviewRow.wins, carriedToNextWeek: reviewRow.carried_to_next_week, ceoComment: reviewRow.ceo_comment }
        : null,
    }
  })

  const pdf = await renderTrackerPdfBuffer({ weekLabel: formatWeekLabel(weekStart), weekStart, engines })

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="md-tracker-${weekStart}.pdf"`,
    },
  })
}
