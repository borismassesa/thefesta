export interface InvitationEventSource {
  name: string | null
  event_type: string | null
  partner1_name: string | null
  partner2_name: string | null
  venue_name: string | null
  address: string | null
  city: string | null
}

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

export function invitationMapsUrl(event: InvitationEventSource): string | null {
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
