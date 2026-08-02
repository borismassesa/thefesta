import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'

// Tracker maintenance. Four idempotent jobs, one endpoint.
//
//   1. GENERATE today's entries for every active owner assignment, including
//      the non-working ones, which are recorded with their reason rather than
//      left as a gap that could mean anything.
//   2. CARRY OVER yesterday's unfinished items to the next working entry,
//      keeping the link back to where each came from.
//   3. MARK MISSED anything past its deadline plus grace. This is the only
//      writer of 'missed' — it is calculated, never selected, because a
//      self-reported miss is either never selected or selected out of guilt.
//   4. REBUILD weekly summaries for the current week so the rollup is current
//      without anybody pressing anything.
//
// ORDER MATTERS. Carry-over runs after generation so the target entry exists,
// and missed-marking runs after carry-over so an entry whose items all moved on
// is 'carried_over' rather than 'missed'.
//
// Protected by a shared secret, same as the other cron endpoints.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = process.env.TRACKER_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'Supabase admin env missing' }, { status: 503 })
  }

  const supabase = createSupabaseAdminClient()

  const { data: generated, error: generateError } = await supabase.rpc(
    'tracker_generate_entries',
    { p_date: null },
  )
  if (generateError) logDbError('tracker.generate', generateError)

  const { data: carried, error: carryError } = await supabase.rpc('tracker_carry_over', {
    p_from_date: null,
  })
  if (carryError) logDbError('tracker.carry_over', carryError)

  const { data: missed, error: missedError } = await supabase.rpc('tracker_mark_missed', {
    p_now: null,
  })
  if (missedError) logDbError('tracker.mark_missed', missedError)

  const rebuilt = await rebuildWeeklySummaries(supabase)

  return NextResponse.json({
    ok: true,
    generated: typeof generated === 'number' ? generated : 0,
    carried: typeof carried === 'number' ? carried : 0,
    markedMissed: typeof missed === 'number' ? missed : 0,
    summariesRebuilt: rebuilt,
  })
}

/**
 * Recompute this week's rollup for every unit that has entries in it.
 *
 * tracker_build_weekly_summary refuses to touch an accepted or locked summary,
 * so a manager who has already signed one off does not find its numbers moving
 * underneath them.
 */
async function rebuildWeeklySummaries(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const weekStart = mondayOf(today)

  const { data, error } = await supabase
    .from('tracker_entries')
    .select('cycle_id, unit_id')
    .gte('entry_date', weekStart)
    .lte('entry_date', today)
    .returns<{ cycle_id: string; unit_id: string }[]>()
  if (error) {
    logDbError('tracker.weekly_targets', error)
    return 0
  }

  const pairs = new Map<string, { cycle_id: string; unit_id: string }>()
  for (const row of data ?? []) {
    pairs.set(`${row.cycle_id}:${row.unit_id}`, row)
  }

  let rebuilt = 0
  for (const pair of pairs.values()) {
    const { error: buildError } = await supabase.rpc('tracker_build_weekly_summary', {
      p_cycle_id: pair.cycle_id,
      p_unit_id: pair.unit_id,
      p_week_start: weekStart,
    })
    if (buildError) {
      logDbError('tracker.weekly_build', buildError, { unitId: pair.unit_id })
      continue
    }
    rebuilt += 1
  }
  return rebuilt
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  const iso = utc.getUTCDay() === 0 ? 7 : utc.getUTCDay()
  return new Date(Date.UTC(y, m - 1, d - (iso - 1))).toISOString().slice(0, 10)
}
