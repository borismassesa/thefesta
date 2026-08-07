/**
 * The canonical check-in report model: types, and every derivation that is
 * pure arithmetic.
 *
 * Deliberately NOT 'server-only'. The Operations view is a client component and
 * needs these types and helpers, and a pure function exported from a
 * 'server-only' module breaks the Turbopack production build the moment a
 * client component imports it. Database access lives next door in
 * report-model.ts, which is server-only.
 *
 * Two rules govern the shapes below.
 *
 *  1. Every count carries its unit in its name. A Double Entry card is ONE
 *     invitation and TWO seats. "93 guests confirmed" is ambiguous in a market
 *     where most cards admit two people, and a report that means cards while
 *     saying people misstates attendance.
 *
 *  2. Field names describe the source condition, never the interpretation.
 *     `exhaustedAttempts` is what the ledger proves; "Additional Entry Attempts
 *     Safely Blocked" is what a template chooses to call it.
 */

/** Bumped whenever the shape below changes incompatibly. Persisted with every
 *  snapshot so a year-old Client report still renders under a newer codebase. */
export const CHECKIN_REPORT_MODEL_VERSION = 1

export type ResolutionMethod = 'credential' | 'pass_id' | 'legacy_entry_code' | 'roster_pick'
export type AdmissionMode = 'scan' | 'manual'
export type FinalizationStatus = 'live' | 'closed' | 'final'

/** A ratio that always knows what it was measured against, so a template can
 *  print "78 of 93" beside "83.9%" without recomputing anything. */
export interface Rate {
  numerator: number
  denominator: number
}

export interface CheckinReportGuest {
  invitationId: string
  name: string
  passId: string | null
  /** 1 = Single, 2+ = Double. */
  entryAllowance: number
  admittedSeats: number
  status: 'admitted' | 'partial' | 'not_arrived'
  /** ISO. Templates format; the model never does. */
  firstAdmittedAt: string | null
  door: string | null
  tableName: string | null
  attendantName: string | null
  resolutionMethod: ResolutionMethod | null
  admissionMode: AdmissionMode | null
  manualReason: string | null
}

export interface ArrivalBucket {
  /** Bucket start, ISO. */
  startsAt: string
  seats: number
  cumulativeSeats: number
}

export interface CheckinReportModel {
  /** Lives at the top level only, deliberately NOT mirrored inside
   *  `finalization`. The whole blob is versioned by this one field; two copies
   *  of a version number is precisely the pair that drifts apart. */
  modelVersion: number

  event: {
    id: string
    name: string
    partner1Name: string | null
    partner2Name: string | null
    eventType: string | null
    startsAt: string | null
    endsAt: string | null
    venueName: string | null
    city: string | null
  }

  /**
   * Self-describing on purpose: a rendered report must never join mutable event
   * state to work out which version of reality it represents.
   */
  finalization: {
    status: FinalizationStatus
    /** Pre-generated before the model is built, so the snapshot row stays
     *  append-only with no post-insert patch to write the id back. */
    snapshotId: string | null
    version: number | null
    checkinClosedAt: string | null
    checkinClosedBy: string | null
    finalizedAt: string | null
    finalizedBy: string | null
  }

  counts: {
    confirmedInvitations: number
    confirmedSeats: number
    admittedInvitations: number
    admittedSeats: number
    singleInvitations: number
    doubleInvitations: number
    partiallyAdmittedInvitations: number
    noShowInvitations: number
  }

  /** Null, never zero, when there is nothing to measure. "0%" and "nothing
   *  happened yet" are different facts and must render differently. */
  rates: {
    seatAttendance: Rate | null
    invitationAttendance: Rate | null
    confirmedDelivery: Rate | null
  }

  arrivals: {
    firstAdmittedAt: string | null
    lastAdmittedAt: string | null
    buckets: ArrivalBucket[]
    bucketMinutes: number
    peak: { startsAt: string; endsAt: string; seats: number } | null
  }

  doors: { label: string; admittedSeats: number; admittedInvitations: number }[]

  integrity: {
    /**
     * result = 'exhausted'. Covers BOTH a re-scan of a used pass AND a request
     * for more seats than remain: the ledger cannot separate them, so neither
     * does this field, and no template may claim it proves intent.
     */
    exhaustedAttempts: number
    notAttendingBlocked: number
    /** Null until the structured admission columns exist. Renders as "not
     *  recorded", never as 0. */
    manualAdmissions: number | null
    amendments: number
  }

  delivery: {
    attempted: number
    /** Positive receipt only. Never counts unknowns. */
    confirmed: number
    read: number
    failed: number
    /** Attempted, no receipt either way. Never folded into success or failure. */
    noReceipt: number
    failureReasons: { reason: string; count: number }[]
  }

  guests: CheckinReportGuest[]
  staff: { name: string; doors: string[]; admittedSeats: number }[]

  generatedAt: string
}

/**
 * One authoritative definition per derived metric.
 *
 * Exists so the PDF, the web dashboard and the CSV cannot quietly grow three
 * different meanings of "attendance". The unit tests assert the model agrees
 * with what is written here.
 */
export const metricDefinitions = {
  confirmedInvitations: {
    source: "guest_invitations WHERE rsvp_status = 'attending'",
    unit: 'invitation',
  },
  confirmedSeats: {
    source: "SUM(guest_invitations.entry_allowance) WHERE rsvp_status = 'attending'",
    unit: 'seat',
  },
  admittedSeats: {
    source: 'SUM(guest_invitations.checked_in_count)',
    unit: 'seat',
  },
  admittedInvitations: {
    source: 'COUNT(guest_invitations) WHERE checked_in_count > 0',
    unit: 'invitation',
  },
  seatAttendance: {
    source: 'admittedSeats / confirmedSeats',
    unit: 'ratio',
    note: 'Seats, not invitations. A Double card is two admissions.',
  },
  exhaustedAttempts: {
    source: "checkin_scan_events WHERE result = 'exhausted'",
    unit: 'attempt',
    note: 'Covers re-scans AND over-allowance requests. Cannot distinguish them.',
  },
  manualAdmissions: {
    source: "checkin_scan_events WHERE admission_mode = 'manual'",
    unit: 'admission',
    note: 'null until the structured admission columns exist.',
  },
  confirmedDelivery: {
    source: "whatsapp_messages WHERE status IN ('delivered','read')",
    unit: 'invitation',
    note: 'Excludes no-receipt rows. Never counts unknowns as delivered.',
  },
} as const

// ---------------------------------------------------------------- derivations

/** A rate is only meaningful against a non-zero denominator. */
export function rateOf(numerator: number, denominator: number): Rate | null {
  return denominator > 0 ? { numerator, denominator } : null
}

/** Bucket width that keeps the arrival timeline readable whatever the door's
 *  span. Same ladder the admin console uses, so the two never disagree about
 *  what "peak" means. */
export function bucketMinutesFor(spanMs: number): number {
  const minutes = spanMs / 60000
  if (minutes <= 60) return 5
  if (minutes <= 180) return 15
  if (minutes <= 480) return 30
  return 60
}

export interface SeatAdmission {
  /** ISO timestamp of the admission. */
  at: string
  /** People admitted by this one mutation. */
  seats: number
}

/**
 * Seats admitted per interval plus the running total, oldest to newest.
 *
 * Weighted by SEATS, not by scan count: a Double card walking in is two people
 * through the door, and a timeline that counted it once would understate the
 * busiest moment of the evening — which is the single number this chart exists
 * to show.
 *
 * Buckets are dense. An interval nobody arrived in is a zero, not a gap, so a
 * lull reads as a lull instead of being compressed away.
 */
export function bucketAdmissions(admissions: SeatAdmission[]): {
  buckets: ArrivalBucket[]
  bucketMinutes: number
  peak: { startsAt: string; endsAt: string; seats: number } | null
} {
  const points = admissions
    .map((a) => ({ t: new Date(a.at).getTime(), seats: a.seats }))
    .filter((p) => !Number.isNaN(p.t) && p.seats > 0)
    .sort((a, b) => a.t - b.t)

  if (points.length === 0) return { buckets: [], bucketMinutes: 0, peak: null }

  const first = points[0].t
  const last = points[points.length - 1].t
  const bucketMinutes = bucketMinutesFor(Math.max(last - first, 1))
  const step = bucketMinutes * 60000
  const start = Math.floor(first / step) * step
  const bucketCount = Math.floor((last - start) / step) + 1

  const seatsPer = new Array<number>(bucketCount).fill(0)
  for (const p of points) {
    seatsPer[Math.floor((p.t - start) / step)] += p.seats
  }

  let running = 0
  const buckets: ArrivalBucket[] = seatsPer.map((seats, i) => {
    running += seats
    return {
      startsAt: new Date(start + i * step).toISOString(),
      seats,
      cumulativeSeats: running,
    }
  })

  // First bucket wins a tie: when two intervals are equally busy the earlier
  // one is the one people remember as the rush.
  let peakIndex = 0
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i].seats > buckets[peakIndex].seats) peakIndex = i
  }
  const peak =
    buckets[peakIndex].seats > 0
      ? {
          startsAt: buckets[peakIndex].startsAt,
          endsAt: new Date(start + (peakIndex + 1) * step).toISOString(),
          seats: buckets[peakIndex].seats,
        }
      : null

  return { buckets, bucketMinutes, peak }
}

/** Single vs Double, in the language the tickets are sold in. */
export function ticketLabelFor(entryAllowance: number): 'Single' | 'Double' | string {
  if (entryAllowance <= 1) return 'Single'
  if (entryAllowance === 2) return 'Double'
  return `Party of ${entryAllowance}`
}

/** How much of a guest's allowance actually walked through the door. */
export function guestStatusFor(
  admittedSeats: number,
  entryAllowance: number,
): CheckinReportGuest['status'] {
  if (admittedSeats <= 0) return 'not_arrived'
  return admittedSeats >= entryAllowance ? 'admitted' : 'partial'
}

/**
 * The attendant's display name, recovered from the audit label the scanner
 * writes: "Asha (Main Gate) [credential] (manual: ...)".
 *
 * Only used for rows written before `attendant_name` became a column. A label
 * that does not match the shape is returned whole rather than guessed at.
 */
export function attendantNameFrom(label: string | null | undefined): string | null {
  const trimmed = label?.trim()
  if (!trimmed) return null
  return trimmed.split(' (')[0]?.trim() || trimmed
}
