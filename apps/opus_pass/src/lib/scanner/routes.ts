/** Public URL prefix for the door-staff Entrance Card Scanner UI. */
export const ENTRANCE_CARD_SCANNER_BASE = '/entrance-card-scanner'

export function scannerEventPath(eventId: string, suffix: '' | '/scan' | '/guests' | '/arrivals' = ''): string {
  return `${ENTRANCE_CARD_SCANNER_BASE}/event/${eventId}${suffix}`
}
