/**
 * Where an event sits in its own timeline. Pure and directive-free so both
 * the server page and the client console can call it.
 *
 * Doors open before the published start and guests trickle in after it, so
 * "live" is a padded window rather than exactly starts_at..ends_at — the
 * same reasoning (and the same trailing allowance) as accessCodeExpiry in
 * checkin-code.ts, which decides how long a door code stays usable.
 */

export type EventLifecycle = 'upcoming' | 'live' | 'ended' | 'undated'

const HOUR_MS = 60 * 60 * 1000
const DOORS_OPEN_LEAD_HOURS = 3
/** Used only when the couple set no explicit end time. */
const ASSUMED_DURATION_HOURS = 12

export function eventLifecycle(
  startsAt: string | null,
  endsAt: string | null = null,
  now: number = Date.now(),
): EventLifecycle {
  const start = startsAt ? new Date(startsAt).getTime() : NaN
  if (Number.isNaN(start)) return 'undated'

  const explicitEnd = endsAt ? new Date(endsAt).getTime() : NaN
  // Guard corrupt data (ends_at before starts_at) the same way accessCodeExpiry
  // does — a bad end time must never shorten the window below the assumed one.
  const end =
    !Number.isNaN(explicitEnd) && explicitEnd > start
      ? explicitEnd
      : start + ASSUMED_DURATION_HOURS * HOUR_MS

  if (now < start - DOORS_OPEN_LEAD_HOURS * HOUR_MS) return 'upcoming'
  if (now > end) return 'ended'
  return 'live'
}

export const LIFECYCLE_LABEL: Record<EventLifecycle, string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  ended: 'Ended',
  undated: 'No date set',
}

/** Pill styling per state. Semantic, not brand — an admin scanning this row
 *  needs "is it happening right now" to pop, and everything else to recede. */
export const LIFECYCLE_TONE: Record<EventLifecycle, string> = {
  upcoming: 'border-[#7E5896]/30 bg-[#F0DFF6] text-[#5d3a78]',
  live: 'border-[#7ec24a] bg-[#9FE870]/25 text-[#2f5518]',
  ended: 'border-gray-200 bg-gray-50 text-gray-500',
  undated: 'border-gray-200 bg-gray-50 text-gray-500',
}

/** Dot colour for the capacity bar and attendance figure. Thresholds are
 *  about how full the room is, so they stay semantic rather than brand. */
export function capacityTone(pct: number): { bar: string; text: string } {
  if (pct >= 90) return { bar: 'bg-rose-500', text: 'text-rose-600' }
  if (pct >= 70) return { bar: 'bg-amber-500', text: 'text-amber-600' }
  return { bar: 'bg-[#7ec24a]', text: 'text-[#3d6b1f]' }
}
