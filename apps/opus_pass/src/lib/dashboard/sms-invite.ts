/**
 * The invitation as plain SMS text.
 *
 * WhatsApp is the primary channel, but Meta refuses delivery for whole classes
 * of recipient that have nothing wrong with them: a number that is not on
 * WhatsApp at all (131026), or one the platform is pacing because the business
 * account is unverified (131049, 130472). Those guests cannot be reached by
 * retrying, and on a wedding week they still have to be told where to turn up.
 *
 * The text is built from the CARD's own field values, not from the event row.
 * The card is what the couple actually filled in and what the designer set: it
 * carries both venues, both times, and the contact people. The event row holds
 * only the reception, so composing from it would quietly drop the ceremony.
 *
 * SENDING IS NOT WIRED. The Beem Africa integration is not configured, so this
 * text is produced for the couple to copy and send from their own phone. That
 * is deliberate rather than unfinished: a message the couple sends by hand is
 * an ordinary person-to-person SMS, which is exactly why it arrives when the
 * business channel will not.
 *
 * MISSING FIELDS ARE OMITTED, NEVER GUESSED. A wedding SMS naming the wrong
 * venue is worse than one that omits it, because the guest acts on it.
 */

import { paletteNames } from './color-names'

/** The card's filled-in details. Every value is optional: a design can be
 *  released with only some fields set, and half a line is worse than none. */
export interface CardInviteFields {
  couple_name_1?: string | null
  couple_name_2?: string | null
  hosts_names?: string | null
  date_day?: string | null
  date_month?: string | null
  date_year?: string | null
  /** First venue — typically the ceremony. */
  venue_1_title?: string | null
  venue_1_place?: string | null
  venue_1_time?: string | null
  /** Second venue — typically the reception. */
  venue_2_title?: string | null
  venue_2_place?: string | null
  venue_2_time?: string | null
  contact_1?: string | null
  contact_2?: string | null
  /** Palette swatches, stored as hex. Named for the SMS — a guest choosing
   *  what to wear cannot act on "#B08A80". */
  palette_1?: string | null
  palette_2?: string | null
  palette_3?: string | null
  palette_4?: string | null
  palette_5?: string | null
}

export interface SmsInviteInput {
  /** The guest as they are addressed, e.g. "Mr & Mrs Mrindoko". */
  guestName: string
  /** The card's own details. */
  fields: CardInviteFields
  /** Swahili event noun, e.g. "harusi". Used only as a fallback heading. */
  eventCategory: string
  /** The guest's admission identifier for this event. */
  passId: string | null
  /** Seats this invitation admits. */
  partySize: number
}

const clean = (v: string | null | undefined): string => (v ?? '').trim()

/** How the ticket is named to a guest — the same words the pass itself uses. */
function cardTypeLabel(partySize: number): string {
  return partySize >= 2 ? 'Double' : 'Single'
}

/** "08 AGOSTI 2026" from the card's three separate date parts. */
function dateLine(f: CardInviteFields): string {
  return [clean(f.date_day), clean(f.date_month), clean(f.date_year)].filter(Boolean).join(' ')
}

/**
 * One venue block, e.g.
 *   "Ibada ya Ndoa: KKKT Salasala Juu kuanzia Saa 09:00 Alasiri"
 *
 * Returns empty when the venue has no title and no place — a bare time with
 * nowhere attached tells a guest nothing.
 */
function venueLine(title: string, place: string, time: string): string {
  const head = title || place
  if (!head) return ''
  const where = title && place ? `${title}: ${place}` : head
  return time ? `${where} kuanzia ${time}` : where
}

export function buildSmsInvite(input: SmsInviteInput): string {
  const f = input.fields
  const lines: string[] = []

  lines.push(`Habari ${input.guestName.trim()},`)
  lines.push('')

  const couple = [clean(f.couple_name_1), clean(f.couple_name_2)].filter(Boolean).join(' & ')
  const date = dateLine(f)
  const heading = couple
    ? `Tafadhali pokea mwaliko wa ${input.eventCategory.trim()} ya ${couple}`
    : `Tafadhali pokea mwaliko wa ${input.eventCategory.trim()}`
  lines.push(date ? `${heading}, itakayofanyika ${date}.` : `${heading}.`)

  // The hosts are who the invitation comes FROM, and Tanzanian invitations name
  // them: a guest reading an SMS from an unknown number places it by the family.
  const hosts = clean(f.hosts_names)
  if (hosts) {
    lines.push('')
    lines.push(`Imeandaliwa na: ${hosts}`)
  }

  const venue1 = venueLine(clean(f.venue_1_title), clean(f.venue_1_place), clean(f.venue_1_time))
  const venue2 = venueLine(clean(f.venue_2_title), clean(f.venue_2_place), clean(f.venue_2_time))
  if (venue1 || venue2) {
    lines.push('')
    if (venue1) lines.push(venue1)
    if (venue2) lines.push(venue2)
  }

  // The card's swatches, named. Approximate by nature, so kept coarse: a guest
  // needs "Dusty Rose", not a precise shade they cannot buy anyway.
  const colours = paletteNames([f.palette_1, f.palette_2, f.palette_3, f.palette_4, f.palette_5])
  if (colours.length > 0) {
    lines.push('')
    lines.push(`RANGI ZA SHEREHE: ${colours.join(', ')}`)
  }

  const contacts = [clean(f.contact_1), clean(f.contact_2)].filter(Boolean)
  if (contacts.length > 0) {
    lines.push('')
    lines.push(`MAWASILIANO: ${contacts.join(', ')}`)
  }

  // The admission identifier is the point of the message: it is what the door
  // reads when there is no QR to scan. "Entrance Pass ID", never "Token" — it
  // is what the gate staff are told to ask for.
  if (input.passId) {
    lines.push('')
    lines.push(`Entrance Pass ID: ${input.passId}`)
    lines.push(`Card type: ${cardTypeLabel(input.partySize)}`)
  }

  lines.push('')
  lines.push('Karibu sana, tutafurahi ukijumuika pamoja nasi.')

  return lines.join('\n')
}
