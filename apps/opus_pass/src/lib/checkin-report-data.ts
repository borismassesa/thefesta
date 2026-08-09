/** The event wall clock used by every Opus Pass check-in report. */
export const CHECKIN_TIME_ZONE = 'Africa/Dar_es_Salaam'

/**
 * Exact report label for an admission allowance.
 *
 * Reports must never floor an unusual stored count onto a smaller sold ticket:
 * calling nine admissions a Double would hide seven people. Wakwe is therefore
 * only the ten-person ticket, while legacy/special counts remain explicit.
 */
export function checkinTicketLabel(partySize: number | null | undefined): string {
  const size = Math.max(1, Math.floor(Number(partySize) || 1))
  if (size === 1) return 'Single'
  if (size === 2) return 'Double'
  if (size === 10) return 'Wakwe'
  return `Party of ${size}`
}

/** Dar es Salaam wall-clock time, independent of the server or viewer zone. */
export function formatCheckinTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: CHECKIN_TIME_ZONE,
  })
}

/** Dar es Salaam date for event metadata. */
export function formatCheckinDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CHECKIN_TIME_ZONE,
  })
}

/** Dar es Salaam report-generation timestamp. */
export function formatCheckinDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CHECKIN_TIME_ZONE,
  })
}
