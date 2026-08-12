/** Opus Pass events and their door operations use Dar es Salaam time. */
export const EVENT_TIME_ZONE = 'Africa/Dar_es_Salaam'

function eventDateKey(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: EVENT_TIME_ZONE,
  }).formatToParts(typeof value === 'string' ? new Date(value) : value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Visible scanner time, fixed to the event's EAT wall clock. */
export function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: EVENT_TIME_ZONE,
  })
}

/** Relative arrival-day heading evaluated in EAT, not the device time zone. */
export function eventDayLabel(iso: string, now = new Date()): string {
  const arrival = new Date(iso)
  if (eventDateKey(arrival) === eventDateKey(now)) return 'Today'

  // Dar es Salaam does not observe DST, so one elapsed day is one local day.
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (eventDateKey(arrival) === eventDateKey(yesterday)) return 'Yesterday'

  return arrival.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: EVENT_TIME_ZONE,
  })
}
