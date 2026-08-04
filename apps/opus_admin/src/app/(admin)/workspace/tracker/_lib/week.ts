// Pure date helpers for the MD Daily Tracker's week grid. No DB access here
// on purpose — both the server page (get-or-create the week row) and the
// client component (render day headers / prev-next nav) need these, and a
// pure export from a 'server-only' actions.ts file breaks client bundling.

export const TRACKER_DAY_LABELS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const

export type TrackerDayLabel = (typeof TRACKER_DAY_LABELS)[number]

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Monday of the ISO week containing `date` (or today if omitted), as a
// YYYY-MM-DD string. Sunday counts as the tail end of the previous week.
export function getIsoWeekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return toDateOnly(d)
}

export function addDays(weekStart: string, days: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toDateOnly(d)
}

// Saturday for a given Monday week_start.
export function getWeekEnd(weekStart: string): string {
  return addDays(weekStart, 5)
}

// The 6 Mon–Sat dates for a given week_start.
export function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 6 }, (_, i) => addDays(weekStart, i))
}

export function formatWeekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const end = new Date(`${getWeekEnd(weekStart)}T00:00:00Z`)
  const fmt = (d: Date, withMonth: boolean) =>
    withMonth
      ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
      : d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()
  if (sameMonth) return `${fmt(start, true)} - ${fmt(end, false)}, ${end.getUTCFullYear()}`
  return `${fmt(start, true)}, ${start.getUTCFullYear()} - ${fmt(end, true)}, ${end.getUTCFullYear()}`
}

export function formatDayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
