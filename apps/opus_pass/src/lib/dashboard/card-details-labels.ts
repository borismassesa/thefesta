// Couple-facing labels and guidance for card fields.
//
// Separate from card-details.ts because that module is 'server-only' — the form
// is a client component, and importing a value (not just a type) from a
// server-only module breaks the build.
//
// Every hint here is VISIBLE on the form, never behind a tooltip or an icon.
// A couple fills this once, isn't trained on it, and a wrong answer ships on
// every printed card. Hidden guidance is, for most people, guidance that does
// not exist: they don't hover, don't click, and on a phone there is no hover at
// all. Density is not a concern on a short single-purpose page.
//
// Kept in step with CARD_FIELD_ROLES, now in @opusfesta/lib.
//
// Still a separate table, and not because it cannot reach the shared one: the
// hints there are written for a DESIGNER mapping artwork ("Fixed design copy",
// "one line of the card"), and these are written for a couple who will never
// see the artwork. Same roles, two audiences, so the wording diverges on
// purpose. What must not diverge is the role KEYS, which is why this is keyed on
// them rather than on labels.
//
// It is an OVERRIDE table, not the whole vocabulary. The page now renders every
// field a card's artwork can hold rather than the handful a designer chose to
// ask for, so roles with no couple-facing rewrite yet (the palette swatches,
// anything added to the shared list tomorrow) fall through to the designer copy
// instead of showing the couple a bare role key.

import { CARD_FIELD_ROLE_KEYS, cardFieldRole, type CardFieldRole } from '@opusfesta/lib'

export type CardFieldCopy = {
  label: string
  hint: string
  example: string
  /** Drives the input type: a colour field is a swatch, not a text box. */
  kind: NonNullable<CardFieldRole['kind']>
  /** Section heading, so a 20-field card reads as a card and not a wall. */
  group: CardFieldRole['group']
}

type CoupleCopy = Pick<CardFieldCopy, 'label' | 'hint' | 'example'>

const FIELD_COPY: Record<string, CoupleCopy> = {
  hosts_names: {
    label: 'Hosts names',
    hint: 'The parents or family hosting the wedding, exactly as you want them printed.',
    example: 'Bw & Bi Ambukege Seeta',
  },
  couple_name_1: {
    label: 'First name on the card',
    hint: 'One partner’s name, in the large script at the centre of the card. Check the spelling carefully.',
    example: 'Moses Seeta',
  },
  couple_name_2: {
    label: 'Second name on the card',
    hint: 'The other partner’s name, printed below the first.',
    example: 'Dayness Mwandri',
  },
  date_day: {
    label: 'Day',
    hint: 'Just the day of the month, in numbers. Not the full date.',
    example: '08',
  },
  date_month: {
    label: 'Month',
    hint: 'The month in words, in the language of your card.',
    example: 'AGOSTI',
  },
  date_year: {
    label: 'Year',
    hint: 'All four digits.',
    example: '2026',
  },
  venue_1_title: {
    label: 'Ceremony title',
    hint: 'What to call the first part of the day.',
    example: 'Ibada ya Ndoa',
  },
  venue_1_place: {
    label: 'Ceremony venue',
    hint: 'Where the ceremony happens. Keep it short so it fits on one line of the card.',
    example: 'KKKT Sala sala JUU',
  },
  venue_1_time: {
    label: 'Ceremony time',
    hint: 'The start time as your guests would say it. Saa 09:00 Alasiri means 3pm.',
    example: 'Saa 09:00 Alasiri',
  },
  venue_2_title: {
    label: 'Reception title',
    hint: 'What to call the second part of the day.',
    example: 'Sala sala M/Lami',
  },
  venue_2_place: {
    label: 'Reception venue',
    hint: 'Where the reception happens. A landmark helps guests find it.',
    example: '(Kwa Mama Seeta)',
  },
  venue_2_time: {
    label: 'Reception time',
    hint: 'When the reception starts.',
    example: 'Saa 12:00 Jioni',
  },
  contact_1: {
    label: 'Contact 1',
    hint: 'Name and phone number of someone guests can call with questions.',
    example: 'Bi. Suzan Seeta +255 755 000 850',
  },
  contact_2: {
    label: 'Contact 2',
    hint: 'A second contact. Leave this blank if you only want one.',
    example: 'Anita Isaac +255 756 089 282',
  },
}

/**
 * Reading order of the card, so a summary lists details the way they appear on
 * the invitation rather than in whatever order the object happened to be keyed.
 *
 * Taken from the shared role list rather than from the override table above:
 * that list IS the card's reading order, and a role only this file knows about
 * would otherwise sort ahead of the ones the couple actually sees first.
 */
export const CARD_FIELD_ORDER: readonly string[] = CARD_FIELD_ROLE_KEYS

/** Position for sorting; unknown roles sink to the end rather than jumping first. */
export function cardFieldOrder(role: string): number {
  const index = CARD_FIELD_ORDER.indexOf(role)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

/** Falls back to the designer's label, then to a readable version of the key. */
export function cardFieldLabel(role: string): string {
  return FIELD_COPY[role]?.label ?? cardFieldRole(role)?.label ?? role.replace(/_/g, ' ')
}

export function cardFieldCopy(role: string): CardFieldCopy {
  const shared = cardFieldRole(role)
  const couple = FIELD_COPY[role]
  return {
    label: couple?.label ?? shared?.label ?? role.replace(/_/g, ' '),
    hint: couple?.hint ?? shared?.hint ?? '',
    example: couple?.example ?? shared?.example ?? '',
    kind: shared?.kind ?? 'text',
    group: shared?.group ?? 'Design',
  }
}

/** Section order on the form: the order the card itself reads in. */
export const CARD_FIELD_GROUPS: readonly CardFieldRole['group'][] = [
  'Hosts',
  'Couple',
  'Date',
  'Venue',
  'Contacts',
  'Design',
]

/** What each section is for, in the couple's terms rather than the designer's. */
export const CARD_GROUP_BLURB: Record<CardFieldRole['group'], string> = {
  Hosts: 'Who is inviting your guests.',
  Couple: 'Your names, in the large script at the centre of the card.',
  Date: 'The wedding date as it should be printed.',
  Venue: 'Where the day happens, and when each part starts.',
  Contacts: 'Who guests should call if they have questions.',
  Design: 'Your wedding colours, printed as swatches on the card.',
}
