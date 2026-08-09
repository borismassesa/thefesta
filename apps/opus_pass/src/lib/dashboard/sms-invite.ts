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
 * carries both venues, both times, the hosts and the contact people. The event
 * row holds only the reception, so composing from it would quietly drop the
 * ceremony.
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
import { ticketTypeLabel } from './types'

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
  /** Swahili event noun, e.g. "harusi". */
  eventCategory: string
  /** The guest's admission identifier for this event. */
  passId: string | null
  /** Seats this invitation admits. */
  partySize: number
}

/** Trim, and collapse the whitespace runs the card fields sometimes carry. */
const clean = (v: string | null | undefined): string => (v ?? '').trim().replace(/\s+/g, ' ')

const SWAHILI_MONTHS = [
  'Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni',
  'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
]

/** Sunday-first, matching Date.getUTCDay(). */
const SWAHILI_WEEKDAYS = [
  'Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi',
]

/** How the ticket is named to a guest — the same words the pass itself uses. */
function cardTypeLabel(partySize: number): string {
  return ticketTypeLabel(partySize)
}

/**
 * "Jumamosi, 08 Agosti 2026" from the card's three separate date parts.
 *
 * The card stores the month as a shouted name ("AGOSTI"), so it is matched
 * case-insensitively and re-cased. The weekday is derived rather than stored:
 * a guest scanning a text reads the day name first, and it is the part that
 * tells them whether they have the right Saturday.
 *
 * Falls back to whatever the card holds when the month cannot be recognised —
 * a date without its weekday still beats no date at all.
 */
export function cardDateLabel(f: CardInviteFields): string {
  const day = clean(f.date_day)
  const month = clean(f.date_month)
  const year = clean(f.date_year)
  const raw = [day, month, year].filter(Boolean).join(' ')
  if (!day || !month || !year) return raw

  const monthIndex = SWAHILI_MONTHS.findIndex((m) => m.toLowerCase() === month.toLowerCase())
  const dayNum = Number(day)
  const yearNum = Number(year)
  // A two-digit year is the trap here. Date.UTC(26, …) is 1926, not 2026, and
  // the weekday it yields is wrong while looking entirely authoritative — a
  // guest reads "Jumapili" for a Saturday wedding. Fall back to the card's own
  // text instead: a date without its weekday beats a confidently wrong one.
  if (
    monthIndex < 0 ||
    !Number.isFinite(dayNum) ||
    !Number.isFinite(yearNum) ||
    yearNum < 1000 ||
    dayNum < 1 ||
    dayNum > 31
  ) {
    return raw
  }

  // Built in UTC purely to read the weekday. No timezone shifting is wanted:
  // the card's date is already the local wedding date.
  const at = new Date(Date.UTC(yearNum, monthIndex, dayNum))
  if (Number.isNaN(at.getTime())) return raw
  const dayPadded = String(dayNum).padStart(2, '0')
  return `${SWAHILI_WEEKDAYS[at.getUTCDay()]}, ${dayPadded} ${SWAHILI_MONTHS[monthIndex]} ${yearNum}`
}

/**
 * Split "Bw. Baraka Kisau +255 767 967 695" into its name and its number.
 *
 * The card stores each contact as a single printed line. A text message reads
 * better with them apart, and the honorific goes: the guest is being given
 * somebody to ring, not introduced to them.
 */
function splitContact(raw: string | null | undefined): { name: string; phone: string } | null {
  const value = clean(raw)
  if (!value) return null
  const match = value.match(/(\+?\d[\d\s()-]{6,})$/)
  if (!match) return { name: value, phone: '' }
  const phone = match[1].trim()
  const name = value
    .slice(0, value.length - match[1].length)
    .trim()
    .replace(/^(Bw|Bi|Mr|Mrs|Ms|Dkt|Dr)\.?\s+/i, '')
    .replace(/[,:-]$/, '')
    .trim()
  return { name, phone }
}

export function buildSmsInvite(input: SmsInviteInput): string {
  const f = input.fields
  const lines: string[] = []

  lines.push(`Habari ${input.guestName.trim()},`)

  // Who is inviting. Tanzanian invitations lead with the family rather than the
  // couple, and a guest reading a text from an unknown number places it by that
  // name before anything else.
  const hosts = clean(f.hosts_names)
  const couple = [clean(f.couple_name_1), clean(f.couple_name_2)].filter(Boolean).join(' & ')
  if (hosts) {
    lines.push('')
    lines.push(
      `Familia ya ${hosts} wanakualika kwenye ${input.eventCategory.trim()} ya watoto wao wapendwa:`,
    )
  } else if (couple) {
    lines.push('')
    lines.push(`Unakaribishwa kwenye ${input.eventCategory.trim()} ya:`)
  }
  if (couple) {
    lines.push('')
    lines.push(`💍 ${couple}`)
  }

  const date = cardDateLabel(f)
  if (date) {
    lines.push('')
    lines.push(`Itakayofanyika 📅 ${date}`)
  }

  // Ceremony. Its own title leads the block, because the card names it.
  const v1Title = clean(f.venue_1_title)
  const v1Place = clean(f.venue_1_place)
  const v1Time = clean(f.venue_1_time)
  if (v1Title || v1Place || v1Time) {
    lines.push('')
    lines.push(v1Title ? `⛪ ${v1Title} itafanyika` : '⛪ Ibada itafanyika')
    if (v1Place) lines.push(v1Place)
    if (v1Time) lines.push(v1Time)
  }

  // Reception. Fixed heading, with the venue's own name on the line under it —
  // the card stores the house as the title and the area as the place.
  const v2Title = clean(f.venue_2_title)
  const v2Place = clean(f.venue_2_place)
  const v2Time = clean(f.venue_2_time)
  if (v2Title || v2Place || v2Time) {
    lines.push('')
    lines.push('🎉 Hafla fupi itakayo fanyika')
    if (v2Title) lines.push(v2Title)
    if (v2Place) lines.push(v2Place)
    if (v2Time) lines.push(v2Time)
  }

  const colours = paletteNames([f.palette_1, f.palette_2, f.palette_3, f.palette_4, f.palette_5])
  if (colours.length > 0) {
    lines.push('')
    lines.push('🎨 Rangi za Sherehe')
    lines.push(colours.join(', '))
  }

  const contacts = [f.contact_1, f.contact_2]
    .map(splitContact)
    .filter((c): c is { name: string; phone: string } => Boolean(c))
  if (contacts.length > 0) {
    lines.push('')
    lines.push('📞 Mawasiliano')
    // A card often carries a bare number with no name against it. "": +255…"
    // with a dangling colon is worse than just the number.
    for (const c of contacts) {
      if (c.name && c.phone) lines.push(`${c.name}: ${c.phone}`)
      else lines.push(c.phone || c.name)
    }
  }

  // What gets a guest through the door when there is no QR to scan.
  if (input.passId) {
    lines.push('')
    lines.push(`Pass ID: ${input.passId}`)
    lines.push(`Kadi: ${cardTypeLabel(input.partySize)}`)
  }

  lines.push('')
  lines.push('Karibu sana, tutafurahi kusherehekea pamoja nawe.')

  return lines.join('\n')
}
