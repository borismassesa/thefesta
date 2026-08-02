const DAY_MS = 86_400_000

export function countLeaveWeekdaysInclusive(startDate: string, endDate: string): number {
  let count = 0
  const end = parseDateOnlyUtc(endDate)

  for (let day = parseDateOnlyUtc(startDate); day <= end; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }

  return count
}

export function countLeaveWeekdaysOverlapping(
  startDate: string,
  endDate: string,
  rangeStartDate: string,
  rangeEndDate: string,
): number {
  const start = parseDateOnlyUtc(startDate)
  const end = parseDateOnlyUtc(endDate)
  const rangeStart = parseDateOnlyUtc(rangeStartDate)
  const rangeEnd = parseDateOnlyUtc(rangeEndDate)

  if (end < rangeStart || start > rangeEnd) return 0

  return countLeaveWeekdaysInclusive(
    formatDateOnlyUtc(Math.max(start, rangeStart)),
    formatDateOnlyUtc(Math.min(end, rangeEnd)),
  )
}

function parseDateOnlyUtc(value: string): number {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10))
  return Date.UTC(year, month - 1, day)
}

function formatDateOnlyUtc(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}
