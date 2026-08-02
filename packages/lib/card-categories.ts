// Which fields a card actually has, by category.
//
// The role vocabulary was reverse-engineered from ONE wedding invitation, and
// every card was then judged against all 28 of them. A Save the Date has no
// reception venue, no second contact and no colour palette, so it reported
// "Not ready to take orders" forever with no way to fix it. That was wrong for
// 89 of the 133 cards in the catalogue.
//
// A category declares two things:
//
//   roles     what a card of this kind can carry. Anything outside this is not
//             offered in the mapper, so a Save the Date stops advertising
//             "Reception time".
//   required  what must be mapped before the card can take an order. This is
//             the honest definition of ready, and it is per category.
//
// Optional-but-present roles are the norm, not an edge case: plenty of cards
// name one contact rather than two.

/** The core almost every card shares: who, what, when. */
const CORE = [
  'hosts_intro',
  'hosts_names',
  'invite_line',
  'event_intro_1',
  'event_intro_2',
  'couple_name_1',
  'ampersand',
  'couple_name_2',
  'date_intro',
  'date_day',
  'date_month',
  'date_year',
] as const

/** Where it happens. Two venues covers a ceremony plus a reception. */
const VENUES = [
  'venue_1_title',
  'venue_1_place',
  'venue_1_time',
  'venue_2_title',
  'venue_2_place',
  'venue_2_time',
] as const

const CONTACTS = ['contact_heading', 'contact_1', 'contact_2'] as const

const PALETTE = [
  'palette_heading',
  'palette_1',
  'palette_2',
  'palette_3',
  'palette_4',
  'palette_5',
] as const

/** Different on every printed card, so it is its own concern. */
const PER_GUEST = ['guest_name'] as const

export type CategorySchema = {
  /** Roles a card in this category can carry. */
  roles: string[]
  /**
   * Of those, the ones that must be mapped before an order can be taken.
   *
   * Kept deliberately small. A required role that a real card legitimately
   * lacks blocks the card with no way out, which is the failure this whole
   * file exists to remove. Tighten these with evidence, not in advance.
   */
  required: string[]
}

function schema(roles: readonly string[], required: readonly string[]): CategorySchema {
  return { roles: [...roles], required: [...required] }
}

/**
 * Schemas for the categories actually in the catalogue.
 *
 * Keyed on the exact `PRODUCT_CATEGORIES` strings, because that is what a
 * product row stores. Anything not listed falls back deliberately: see
 * `categorySchema`.
 */
const SCHEMAS: Record<string, CategorySchema> = {
  // The full article: hosts, couple, both venues, contacts and the RANGI
  // palette. This is the shape the role vocabulary was derived from.
  'Wedding Invitations': schema(
    [...CORE, ...VENUES, ...CONTACTS, ...PALETTE, ...PER_GUEST],
    ['couple_name_1', 'couple_name_2', 'date_day', 'date_month', 'date_year', 'venue_1_place'],
  ),

  // A save the date announces a date and little else. It usually has no venue
  // detail at all, because that is what the invitation is for.
  'Save the Dates': schema(
    [...CORE, 'venue_1_title', 'venue_1_place', ...PER_GUEST],
    ['couple_name_1', 'couple_name_2', 'date_day', 'date_month', 'date_year'],
  ),

  // A sendoff is one event at one venue, hosted by the family.
  'Sendoff': schema(
    [
      ...CORE,
      'venue_1_title',
      'venue_1_place',
      'venue_1_time',
      ...CONTACTS,
      ...PALETTE,
      ...PER_GUEST,
    ],
    ['couple_name_1', 'date_day', 'date_month', 'date_year', 'venue_1_place'],
  ),

  // Same single-venue shape as a sendoff. Often one name rather than a couple,
  // so couple_name_2 is available but never required.
  'Kitchen Party': schema(
    [
      ...CORE,
      'venue_1_title',
      'venue_1_place',
      'venue_1_time',
      ...CONTACTS,
      ...PALETTE,
      ...PER_GUEST,
    ],
    ['couple_name_1', 'date_day', 'date_month', 'date_year', 'venue_1_place'],
  ),
}

/** Every role in the vocabulary, for the fallback. */
const ALL_ROLES = [...CORE, ...VENUES, ...CONTACTS, ...PALETTE, ...PER_GUEST]

/**
 * The schema for a category.
 *
 * An unrecognised category gets every role and requires none. That is the safe
 * direction: a card type we have not modelled yet is never falsely blocked, and
 * an admin can still map whatever the artwork happens to have. Writing a
 * guessed schema for a card nobody has seen would block real work on a
 * fiction.
 */
export function categorySchema(category: string | null | undefined): CategorySchema {
  const known = SCHEMAS[(category ?? '').trim()]
  if (known) return known
  return { roles: [...ALL_ROLES], required: [] }
}

/** Whether we have a real schema for this category, or are falling back. */
export function hasCategorySchema(category: string | null | undefined): boolean {
  return Boolean(SCHEMAS[(category ?? '').trim()])
}

/** Categories with a defined schema, for the generated designer guidelines. */
export function definedCategories(): string[] {
  return Object.keys(SCHEMAS)
}
