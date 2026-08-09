/**
 * Pure data-shaping for the event check-in report. Kept out of
 * CheckinReportClient.tsx so the arithmetic can be tested directly: a 'use
 * client' component is not importable by the node test runner, and the
 * bucketing below is the kind of off-by-one-prone code that earns a test.
 */

export interface ReportArrival {
  guestName: string
  doorLabel: string | null
  partySize: number
  checkedInAt: string
}

export interface ArrivalBucket {
  /** Bucket start, epoch ms. */
  at: number
  /** Bucket start as a local HH:MM label, for the chart axis. */
  label: string
  /** Arrivals inside this bucket. */
  count: number
  /** Running total up to and including this bucket. */
  cumulative: number
}

/** Check-in operations are reported on the Dar es Salaam event clock. */
export const CHECKIN_TIME_ZONE = 'Africa/Dar_es_Salaam'

export function formatReportDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CHECKIN_TIME_ZONE,
  })
}

/**
 * Long form for the letterhead meta block: "8 August 2026, 18:00". Built from
 * the two parts because toLocaleString joins them with " at ", which reads
 * nothing like the "date, time" the rest of the report prints.
 */
export function formatReportLongDateTime(iso: string): string {
  const at = new Date(iso)
  const date = at.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CHECKIN_TIME_ZONE,
  })
  return `${date}, ${formatReportTime(iso)}`
}

export function formatReportTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CHECKIN_TIME_ZONE,
  })
}

/**
 * Party size in the language the tickets are actually sold in. A guest holding
 * a two-person ticket has a "Double", not a "party of 2" — the report has to
 * match what the couple and the door staff say out loud.
 *
 * Exact match, not a floor: a count that lands between two sold sizes is a
 * hand-entered special, and naming it after the smaller ticket would understate
 * how many people the report is accounting for. Mirrors partySizeLabel in
 * opus_pass_mobile/src/lib/scannerRoster.ts.
 */
export function ticketLabel(partySize: number): string {
  if (partySize === 1) return 'Single'
  if (partySize === 2) return 'Double'
  // Wakwe: the in-laws' ten-on-one-QR ticket.
  if (partySize === 10) return 'Wakwe'
  return `Party of ${partySize}`
}

/** Bucket width that keeps the arrival chart readable whatever the door's span. */
export function bucketMinutesFor(spanMs: number): number {
  const minutes = spanMs / 60000
  if (minutes <= 60) return 5
  if (minutes <= 180) return 15
  if (minutes <= 480) return 30
  return 60
}

/**
 * Arrivals per interval plus the running total, oldest → newest.
 *
 * Buckets are dense: an interval nobody arrived in is a zero, not a gap, so
 * the shape of the flow is honest — a sparse series would compress a lull
 * into nothing and make a slow patch look like a busy one.
 */
export function bucketArrivals(arrivals: ReportArrival[]): {
  points: ArrivalBucket[]
  bucketMinutes: number
} {
  const times = arrivals
    .map((a) => new Date(a.checkedInAt).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)
  if (times.length === 0) return { points: [], bucketMinutes: 0 }

  const first = times[0]
  const last = times[times.length - 1]
  const bucketMinutes = bucketMinutesFor(Math.max(last - first, 1))
  const step = bucketMinutes * 60000
  const start = Math.floor(first / step) * step
  const bucketCount = Math.floor((last - start) / step) + 1

  const counts = new Array<number>(bucketCount).fill(0)
  for (const t of times) counts[Math.min(bucketCount - 1, Math.floor((t - start) / step))] += 1

  let running = 0
  return {
    points: counts.map((count, i) => {
      running += count
      const at = start + i * step
      return {
        at,
        label: new Date(at).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: CHECKIN_TIME_ZONE,
        }),
        count,
        cumulative: running,
      }
    }),
    bucketMinutes,
  }
}
