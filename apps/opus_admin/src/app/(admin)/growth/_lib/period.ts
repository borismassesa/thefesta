const MONTH_RE = /^\d{4}-\d{2}-01$/

export type MonthBounds = {
  start: string
  next: string
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function isMonthKey(value: string): boolean {
  return MONTH_RE.test(value)
}

export function nextMonthKey(monthKey: string): string {
  if (!isMonthKey(monthKey)) throw new Error('Invalid month key.')

  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}

export function monthBounds(monthKey: string): MonthBounds {
  return { start: monthKey, next: nextMonthKey(monthKey) }
}

export function dateIsInHalfOpenMonth(dateKey: string, bounds: MonthBounds): boolean {
  return dateKey >= bounds.start && dateKey < bounds.next
}
