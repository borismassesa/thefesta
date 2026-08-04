// Weekly aggregation — pure, no I/O.
//
// "Weekly summaries aggregate daily entries accurately" is the acceptance
// criterion, and accuracy here is mostly about the DENOMINATOR. Counting public
// holidays and approved leave as days somebody failed to track makes every week
// containing one look like a week somebody skipped, and a completion rate that
// punishes people for public holidays is worse than no completion rate.
//
// Mirrors tracker_build_weekly_summary() in the migration.

import type { TrackerStatus } from './status'

export type WeeklyEntry = {
  entryDate: string
  status: TrackerStatus
  submittedAt: string | null
  isLate: boolean
  suppressionReason: string | null
  loggedMinutes: number
}

export type WeeklyItem = {
  entryDate: string
  kind: string
  status: TrackerStatus
  title: string
  carriedFromItemId: string | null
  carryCount: number
}

export type WeeklyAggregate = {
  entriesTotal: number
  /** Days an entry was actually owed. The denominator for every rate below. */
  workingDays: number
  entriesDone: number
  entriesBlocked: number
  entriesMissed: number
  entriesCarriedOver: number
  entriesNotWorking: number
  entriesWaived: number
  entriesSubmitted: number
  entriesLate: number
  itemsCompleted: number
  itemsCarried: number
  blockersOpen: number
  loggedMinutes: number
  /** Submitted working days as a percentage, 0 when nothing was owed. */
  completionPercent: number
}

export function aggregateWeek(
  entries: WeeklyEntry[],
  items: WeeklyItem[] = [],
): WeeklyAggregate {
  const count = (predicate: (e: WeeklyEntry) => boolean) => entries.filter(predicate).length

  // Suppressed days are excluded from the denominator, not counted as failures.
  const workingDays = count((e) => e.suppressionReason === null)
  const entriesSubmitted = count((e) => e.submittedAt !== null)

  return {
    entriesTotal: entries.length,
    workingDays,
    entriesDone: count((e) => e.status === 'done'),
    entriesBlocked: count((e) => e.status === 'blocked'),
    entriesMissed: count((e) => e.status === 'missed'),
    entriesCarriedOver: count((e) => e.status === 'carried_over'),
    entriesNotWorking: count((e) => e.status === 'not_working_day'),
    entriesWaived: count((e) => e.status === 'waived'),
    entriesSubmitted,
    entriesLate: count((e) => e.isLate),
    itemsCompleted: items.filter((i) => i.status === 'done').length,
    itemsCarried: items.filter((i) => i.carriedFromItemId !== null).length,
    blockersOpen: items.filter((i) => i.kind === 'blocker' && i.status !== 'done').length,
    loggedMinutes: entries.reduce((sum, e) => sum + (e.loggedMinutes || 0), 0),
    completionPercent:
      workingDays === 0 ? 0 : Math.round((entriesSubmitted / workingDays) * 100),
  }
}

export type WeeklyDraft = {
  wins: string[]
  missedCommitments: string[]
  carriedForward: string[]
  keyBlockers: string[]
}

/**
 * Seed the weekly review from what the daily entries already say.
 *
 * Not a replacement for writing it: the author edits everything. But asking
 * someone to retype their own week from their own entries is how weekly reviews
 * stop being filled in.
 */
export function draftWeekly(items: WeeklyItem[]): WeeklyDraft {
  const unique = (values: string[]) => [...new Set(values)]

  return {
    wins: unique(
      items.filter((i) => i.status === 'done' && i.kind !== 'blocker').map((i) => i.title),
    ),
    // Commitments that were never finished and never carried: nothing happened
    // to them at all, which is exactly what a weekly review should surface.
    missedCommitments: unique(
      items
        .filter(
          (i) =>
            (i.kind === 'planned' || i.kind === 'next_step') &&
            (i.status === 'missed' || i.status === 'not_started'),
        )
        .map((i) => i.title),
    ),
    carriedForward: unique(
      items.filter((i) => i.status === 'carried_over' || i.carryCount > 0).map((i) => i.title),
    ),
    keyBlockers: unique(
      items.filter((i) => i.kind === 'blocker' && i.status !== 'done').map((i) => i.title),
    ),
  }
}

export type KpiMovement = {
  name: string
  previous: number | null
  current: number | null
  target: number | null
}

export type KpiDirection = 'up' | 'down' | 'flat' | 'unknown'

/** Which way a KPI moved, for the arrow beside it. */
export function kpiDirection(kpi: KpiMovement): KpiDirection {
  if (kpi.previous === null || kpi.current === null) return 'unknown'
  if (kpi.current > kpi.previous) return 'up'
  if (kpi.current < kpi.previous) return 'down'
  return 'flat'
}

/**
 * Percentage of target, or null when there is nothing to measure against.
 *
 * Null rather than 0 when the target is missing or zero: showing "0% of target"
 * for a KPI with no target reads as failure rather than as absence.
 */
export function kpiAttainment(kpi: KpiMovement): number | null {
  if (kpi.current === null || kpi.target === null || kpi.target === 0) return null
  return Math.round((kpi.current / kpi.target) * 100)
}

export function parseKpiMovement(value: unknown): KpiMovement[] {
  if (!Array.isArray(value)) return []
  const out: KpiMovement[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const kpi = raw as Record<string, unknown>
    if (typeof kpi.name !== 'string' || kpi.name.trim() === '') continue
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null
    out.push({
      name: kpi.name,
      previous: num(kpi.previous),
      current: num(kpi.current),
      target: num(kpi.target),
    })
  }
  return out
}
