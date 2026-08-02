// Date fields on an approval carry an optional clock time. A ride booked
// for "1 Aug" tells an approver nothing — the pickup is at 14:30 or it is
// not — and the same is true of a borrowed camera, a trip itinerary or an
// RFQ that closes at end of business.
//
// The time rides inside the value that field already had, so nothing about
// storage changes: `YYYY-MM-DD` for a bare day, `YYYY-MM-DDTHH:mm` once a
// time is set, and a range joins two of those with `/`. Requests written
// before times existed keep parsing, and a field where the hour is
// meaningless (a hire date) is simply left without one.

export type DateTimeParts = { date: string; time: string }

export function splitDateTime(value: string): DateTimeParts {
  const [date = '', rest = ''] = (value ?? '').split('T')
  // Trim any seconds a browser volunteers — the inputs are minute-grained.
  return { date, time: rest.slice(0, 5) }
}

export function joinDateTime(date: string, time: string): string {
  // A time typed before a date is kept rather than dropped; the date part
  // stays empty and `required` validation reads it back as missing.
  if (!time) return date
  return `${date}T${time}`
}

export function splitRange(value: string): [string, string] {
  const [start = '', end = ''] = (value || '/').split('/')
  return [start, end]
}

export function joinRange(start: string, end: string): string {
  return `${start}/${end}`
}

// Comparable key for one end of a range. A bare date sorts as midnight, so
// a legacy date-only value still orders correctly against one that carries
// a time. Zero-padded ISO parts compare correctly as plain strings, which
// keeps this free of `new Date` timezone drift.
export function sortKey(value: string): string {
  const { date, time } = splitDateTime(value)
  return `${date}T${time || '00:00'}`
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// "01 Aug 2026, 14:30" — or just the day when no time was set. Parsed by
// hand instead of through `Date` so a date-only value is not shifted into
// the previous day by the UTC-midnight rule.
export function formatDateTime(value: string): string {
  const { date, time } = splitDateTime(value)
  if (!date) return time ? time : ''
  const [y, m, d] = date.split('-')
  const month = MONTHS[Number(m) - 1]
  if (!month || !y || !d) return value
  const day = `${d} ${month} ${y}`
  return time ? `${day}, ${time}` : day
}

// "01 Aug 2026, 14:30 → 18:00" when both ends fall on the same day,
// otherwise both ends in full.
export function formatRange(value: string): string {
  const [start, end] = splitRange(value)
  if (!start && !end) return ''
  if (!start || !end) return formatDateTime(start || end)
  const a = splitDateTime(start)
  const b = splitDateTime(end)
  if (a.date && a.date === b.date) {
    if (!a.time && !b.time) return formatDateTime(start)
    return `${formatDateTime(start)} → ${b.time || formatDateTime(end)}`
  }
  return `${formatDateTime(start)} → ${formatDateTime(end)}`
}

// Single entry point for read-only surfaces (list summaries, digests) that
// hold a raw field value and its declared kind.
export function formatFieldValue(kind: string, value: string): string {
  if (kind === 'date') return formatDateTime(value)
  if (kind === 'date-range') return formatRange(value)
  return value
}
