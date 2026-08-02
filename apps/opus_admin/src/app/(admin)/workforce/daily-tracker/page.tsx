import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail, getCallerPermissions, hasAnyPermission } from '@/lib/admin-auth'
import { getEmployees } from '../_lib/queries'
import DailyTrackerClient, {
  type TrackerEngine,
  type TrackerEntry,
  type TrackerReview,
  type TrackerTrendPoint,
} from './DailyTrackerClient'
import { addDays, getIsoWeekStart, getWeekEnd } from './_lib/week'

export const dynamic = 'force-dynamic'

const TZ = 'Africa/Dar_es_Salaam'
const TREND_DAYS = 28

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
  slug: string
  name: string
  sort_order: number
  md_employee_ids: string[] | null
  acting_md_employee_id: string | null
  works_saturday: boolean
}

type WeekRow = {
  id: string
  week_start: string
  week_end: string
}

type EntryRow = {
  id: string
  engine_id: string
  entry_date: string
  top_priority: string
  other_tasks: string
  status: string | null
  blockers: string
  end_of_day_note: string
  updated_by_employee_id: string | null
}

type ReviewRow = {
  engine_id: string
  wins: string
  carried_to_next_week: string
  ceo_comment: string
  reviewed_by_employee_id: string | null
  reviewed_at: string | null
}

async function getOrCreateWeek(weekStart: string): Promise<WeekRow> {
  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase
    .from('md_tracker_weeks')
    .select('id, week_start, week_end')
    .eq('week_start', weekStart)
    .maybeSingle<WeekRow>()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('md_tracker_weeks')
    .insert({ week_start: weekStart, week_end: getWeekEnd(weekStart) })
    .select('id, week_start, week_end')
    .single<WeekRow>()
  if (error) {
    // Concurrent first-visit race — someone else created it a moment ago.
    const { data: retried } = await supabase
      .from('md_tracker_weeks')
      .select('id, week_start, week_end')
      .eq('week_start', weekStart)
      .maybeSingle<WeekRow>()
    if (retried) return retried
    throw new Error(`[md-tracker] could not create week: ${error.message}`)
  }
  return created
}

export default async function DailyTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const supabase = createSupabaseAdminClient()

  // Engine list drives the write-permission keys (md_tracker.<slug>.write),
  // so a new engine added to the DB is writable/viewable without a code
  // change — no more hardcoded ENGINE_WRITE_KEYS array.
  const { data: engineRows } = await supabase
    .from('md_tracker_engines')
    .select('id, slug, name, sort_order, md_employee_ids, acting_md_employee_id, works_saturday')
    .order('sort_order', { ascending: true })
    .returns<EngineRow[]>()
  const engineWriteKeys = (engineRows ?? []).map((e) => `md_tracker.${e.slug}.write`)

  const canView = await hasAnyPermission(['workforce.read', ...engineWriteKeys, 'md_tracker.review'])
  if (!canView) {
    throw new Error("You don't have permission to view the MD Daily Tracker.")
  }

  const { week: weekParam } = await searchParams
  // eslint-disable-next-line react-hooks/purity -- server component, reflects request time
  const today = todayInTz()
  const weekStart = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : getIsoWeekStart(new Date())

  const week = await getOrCreateWeek(weekStart)
  const priorSaturday = addDays(weekStart, -1)
  const trendSince = addDays(today, -(TREND_DAYS - 1))

  const [{ data: entryRows }, { data: reviewRows }, perms, allEmployees, { data: priorSatRows }, { data: trendRows }] =
    await Promise.all([
      supabase
        .from('md_tracker_entries')
        .select('id, engine_id, entry_date, top_priority, other_tasks, status, blockers, end_of_day_note, updated_by_employee_id')
        .eq('week_id', week.id)
        .returns<EntryRow[]>(),
      supabase
        .from('md_tracker_week_reviews')
        .select('engine_id, wins, carried_to_next_week, ceo_comment, reviewed_by_employee_id, reviewed_at')
        .eq('week_id', week.id)
        .returns<ReviewRow[]>(),
      getCallerPermissions(),
      getEmployees(),
      supabase
        .from('md_tracker_entries')
        .select('engine_id, top_priority, status')
        .eq('entry_date', priorSaturday)
        .returns<Array<{ engine_id: string; top_priority: string; status: string | null }>>(),
      supabase
        .from('md_tracker_entries')
        .select('engine_id, entry_date, status')
        .gte('entry_date', trendSince)
        .lte('entry_date', today)
        .returns<Array<{ engine_id: string; entry_date: string; status: string | null }>>(),
    ])

  const callerEmail = await getCallerEmail()
  const currentEmployee = callerEmail
    ? (allEmployees.find((e) => e.email.toLowerCase() === callerEmail) ?? null)
    : null

  const employeeIds = Array.from(
    new Set(
      [
        ...(engineRows ?? []).flatMap((e) => [...(e.md_employee_ids ?? []), e.acting_md_employee_id]),
        ...(entryRows ?? []).map((r) => r.updated_by_employee_id),
        ...(reviewRows ?? []).map((r) => r.reviewed_by_employee_id),
      ].filter((id): id is string => Boolean(id)),
    ),
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

  const writableSlugs = new Set(
    engineWriteKeys.filter((key) => perms.has(key)).map((key) => key.split('.')[1]),
  )
  const canReview = perms.has('md_tracker.review')
  const employees = allEmployees.map((e) => ({ id: e.id, name: e.name }))

  const engines: TrackerEngine[] = (engineRows ?? []).map((e) => {
    const mdIds = e.md_employee_ids ?? []
    return {
      id: e.id,
      slug: e.slug,
      name: e.name,
      mdIds,
      mdNames: mdIds.map((id) => employeeNames.get(id)).filter((n): n is string => Boolean(n)),
      actingMdId: e.acting_md_employee_id,
      actingMdName: e.acting_md_employee_id ? (employeeNames.get(e.acting_md_employee_id) ?? null) : null,
      worksSaturday: e.works_saturday,
      canWrite: writableSlugs.has(e.slug) || canReview,
    }
  })

  const entries: TrackerEntry[] = (entryRows ?? []).map((r) => ({
    id: r.id,
    engineId: r.engine_id,
    entryDate: r.entry_date,
    topPriority: r.top_priority,
    otherTasks: r.other_tasks,
    status: r.status as TrackerEntry['status'],
    blockers: r.blockers,
    endOfDayNote: r.end_of_day_note,
    updatedByName: r.updated_by_employee_id ? (employeeNames.get(r.updated_by_employee_id) ?? null) : null,
  }))

  const reviews: TrackerReview[] = (reviewRows ?? []).map((r) => ({
    engineId: r.engine_id,
    wins: r.wins,
    carriedToNextWeek: r.carried_to_next_week,
    ceoComment: r.ceo_comment,
    reviewedByName: r.reviewed_by_employee_id ? (employeeNames.get(r.reviewed_by_employee_id) ?? null) : null,
    reviewedAt: r.reviewed_at,
  }))

  const priorWeekLastEntries: Record<string, { topPriority: string; status: TrackerEntry['status'] }> = {}
  for (const r of priorSatRows ?? []) {
    priorWeekLastEntries[r.engine_id] = { topPriority: r.top_priority, status: r.status as TrackerEntry['status'] }
  }

  const trend: TrackerTrendPoint[] = (trendRows ?? []).map((r) => ({
    engineId: r.engine_id,
    date: r.entry_date,
    status: r.status as TrackerEntry['status'],
  }))

  return (
    <DailyTrackerClient
      weekStart={week.week_start}
      weekId={week.id}
      today={today}
      engines={engines}
      entries={entries}
      reviews={reviews}
      canReview={canReview}
      employees={employees}
      currentEmployeeName={currentEmployee?.name ?? null}
      priorWeekLastEntries={priorWeekLastEntries}
      trend={trend}
      trendDays={TREND_DAYS}
    />
  )
}
