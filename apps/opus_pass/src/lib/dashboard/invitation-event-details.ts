export interface InvitationEventSource {
  name: string | null
  event_type: string | null
  partner1_name: string | null
  partner2_name: string | null
  venue_name: string | null
  address: string | null
  city: string | null
  venue_latitude?: number | string | null
  venue_longitude?: number | string | null
}

export type InvitationCoordinatePair = { latitude: number; longitude: number }

export type InvitationCoordinateResult =
  | { ok: true; value: InvitationCoordinatePair | null }
  | { ok: false; error: string }

const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || ''

/** The selected event owns the names shown in invitation messages. */
export function invitationHostName(event: InvitationEventSource): string {
  const names = [clean(event.partner1_name), clean(event.partner2_name)].filter(Boolean)
  return names.length > 0 ? names.join(' & ') : clean(event.name) || 'The Couple'
}

/** Human-readable place used by both the dashboard preview and webhook reply. */
export function invitationLocation(event: InvitationEventSource): string {
  return [clean(event.venue_name), clean(event.address), clean(event.city)].filter(Boolean).join(', ')
}

/** Validate optional decimal-degree inputs at the server boundary. A partial
 *  pair is refused so Maps can never combine one exact coordinate with one
 *  guessed value. */
export function parseInvitationCoordinates(
  latitudeInput: unknown,
  longitudeInput: unknown,
): InvitationCoordinateResult {
  const rawLatitude = typeof latitudeInput === 'string' ? latitudeInput.trim() : latitudeInput
  const rawLongitude = typeof longitudeInput === 'string' ? longitudeInput.trim() : longitudeInput
  const latitudeMissing = rawLatitude === '' || rawLatitude === null || rawLatitude === undefined
  const longitudeMissing = rawLongitude === '' || rawLongitude === null || rawLongitude === undefined

  if (latitudeMissing && longitudeMissing) return { ok: true, value: null }
  if (latitudeMissing || longitudeMissing) {
    return { ok: false, error: 'Add both latitude and longitude, or leave both blank.' }
  }

  const latitude = Number(rawLatitude)
  const longitude = Number(rawLongitude)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { ok: false, error: 'Latitude must be a number between -90 and 90.' }
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { ok: false, error: 'Longitude must be a number between -180 and 180.' }
  }
  return { ok: true, value: { latitude, longitude } }
}

export function invitationMapsUrl(event: InvitationEventSource): string | null {
  const coordinates = parseInvitationCoordinates(event.venue_latitude, event.venue_longitude)
  if (coordinates.ok && coordinates.value) {
    return `https://maps.google.com/?q=${coordinates.value.latitude},${coordinates.value.longitude}`
  }
  const place = invitationLocation(event)
  return place ? `https://maps.google.com/?q=${encodeURIComponent(place)}` : null
}

export function invitationPartner2Required(event: InvitationEventSource): boolean {
  return ['wedding', 'muslim_wedding', 'anniversary'].includes(clean(event.event_type).toLowerCase())
}

/** Minimum truthful configuration for a template that always has View Location. */
export function invitationDetailsReady(event: InvitationEventSource): boolean {
  return Boolean(
    clean(event.partner1_name) &&
      (!invitationPartner2Required(event) || clean(event.partner2_name)) &&
      invitationLocation(event),
  )
}
